import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { seedDemoData } from "../../prisma/seed-demo-data.js";
import {
  createLogMailer,
  createResendMailer,
  type Mailer,
} from "../../src/modules/notifications/mailer.js";
import {
  deliverNotification,
  enqueueOrderEmail,
  processPendingNotifications,
} from "../../src/modules/notifications/notification.service.js";
import { renderOrderEmail } from "../../src/modules/notifications/templates.js";
import { handleOrderEvent } from "../../src/modules/orders/order-effects.js";
import {
  createOrder,
  createProduct,
  createTestClient,
  resetDatabase,
  type PrismaClient,
} from "../db/helpers.js";
import { createTestApp } from "../helpers/app.js";

let prisma: PrismaClient;
let ctx: Awaited<ReturnType<typeof createTestApp>>;

beforeAll(async () => {
  prisma = createTestClient();
  ctx = await createTestApp(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDatabase(prisma);
  await seedDemoData(prisma);
});

async function orderFor(type: "PICKUP" | "DELIVERY" = "PICKUP") {
  const product = await createProduct(prisma);
  const { user } = await ctx.userWithToken({ username: "cliente1", phone: "+34 600 000 000" });
  const order = await createOrder(prisma, { userId: user.id, productId: product.id, type });
  return { user, order };
}

const failing = (message = "SMTP down"): Mailer => ({
  driver: "test",
  send: vi.fn().mockRejectedValue(new Error(message)),
});

describe("email templates", () => {
  const base = {
    orderNumber: 12,
    type: "PICKUP" as const,
    customerName: "Ana <script>alert(1)</script>",
    total: "21.50",
    scheduledFor: null,
    estimatedReadyAt: new Date("2026-11-10T12:30:00Z"),
    cancellationReason: "Sin existencias & más",
    timezone: "Europe/Madrid",
    storeName: "FORNO",
    storePhone: "+34 900 000 000",
    storeAddress: "Calle Demo 1, 28001 Madrid",
  };

  it("are in Spanish, mention the order and escape every variable in the HTML", () => {
    const email = renderOrderEmail("ORDER_REJECTED", base);
    expect(email.subject).toBe("No hemos podido aceptar tu pedido #12");
    expect(email.text).toContain("Sin existencias & más");
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).toContain("Sin existencias &amp; más");
  });

  it("have no commercial content (only order information)", () => {
    for (const template of [
      "ORDER_CONFIRMED",
      "ORDER_ACCEPTED",
      "ORDER_READY",
      "ORDER_OUT_FOR_DELIVERY",
      "ORDER_COMPLETED",
      "ORDER_CANCELLED",
    ] as const) {
      const email = renderOrderEmail(template, base);
      expect(email.subject, template).toMatch(/#12/);
      expect(email.text).not.toMatch(/oferta|descuento|promoci|suscr/i);
    }
  });
});

describe("queue", () => {
  it("records one notice per order, template and recipient (no duplicates)", async () => {
    const { order } = await orderFor();
    const [first, second] = await Promise.all([
      enqueueOrderEmail(prisma, order.id, "ORDER_CONFIRMED"),
      enqueueOrderEmail(prisma, order.id, "ORDER_CONFIRMED"),
    ]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect(await prisma.notificationLog.count()).toBe(1);
    const log = await prisma.notificationLog.findFirstOrThrow();
    expect(log).toMatchObject({ status: "PENDING", template: "ORDER_CONFIRMED" });
    expect(log.subject).toMatch(/Hemos recibido tu pedido/);
    expect(log.bodyHtml).toContain("<html");
  });

  it("log mode keeps the notice readable but never claims it was sent", async () => {
    const { order } = await orderFor();
    const id = (await enqueueOrderEmail(prisma, order.id, "ORDER_ACCEPTED"))!;
    const done = await deliverNotification(prisma, createLogMailer(), id);
    expect(done).toMatchObject({ status: "LOGGED", sentAt: null, attempts: 1 });
  });

  it("retries with growing waits and gives up after 5 attempts, recording the error", async () => {
    const { order } = await orderFor();
    const id = (await enqueueOrderEmail(prisma, order.id, "ORDER_READY"))!;
    const mailer = failing("boom");
    let now = new Date();
    const waits: number[] = [];
    for (let attempt = 1; attempt <= 5; attempt++) {
      const result = (await deliverNotification(prisma, mailer, id, now))!;
      expect(result.attempts).toBe(attempt);
      expect(result.lastError).toBe("boom");
      if (attempt < 5) {
        expect(result.status).toBe("PENDING");
        waits.push(Math.round((result.nextAttemptAt!.getTime() - now.getTime()) / 60_000));
        now = new Date(result.nextAttemptAt!.getTime() + 1000);
      } else {
        expect(result.status).toBe("FAILED");
        expect(result.nextAttemptAt).toBeNull();
      }
    }
    expect(waits).toEqual([1, 5, 15, 60]);
    // Ya no se reintenta.
    expect(await deliverNotification(prisma, mailer, id, new Date(now.getTime() + 1e9))).toBeNull();
  });

  it("does not retry before its turn, and two workers never send the same notice twice", async () => {
    const { order } = await orderFor();
    const id = (await enqueueOrderEmail(prisma, order.id, "ORDER_COMPLETED"))!;
    const send = vi.fn().mockResolvedValue("sent");
    const mailer: Mailer = { driver: "test", send };
    const results = await Promise.all([
      deliverNotification(prisma, mailer, id),
      deliverNotification(prisma, mailer, id),
      deliverNotification(prisma, mailer, id),
    ]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await prisma.notificationLog.findUniqueOrThrow({ where: { id } })).status).toBe("SENT");

    const flaky = failing();
    const second = (await enqueueOrderEmail(prisma, order.id, "ORDER_CANCELLED"))!;
    await deliverNotification(prisma, flaky, second);
    expect(await processPendingNotifications(prisma, flaky, new Date())).toBe(0);
    expect(
      await processPendingNotifications(prisma, flaky, new Date(Date.now() + 2 * 60_000)),
    ).toBe(1);
  });
});

describe("Resend driver", () => {
  const message = { to: "ana@example.com", subject: "Hola", text: "t", html: "<p>t</p>" };

  it("sends through the HTTP API with the key in the header, and only to the allowed address", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const mailer = createResendMailer({
      apiKey: "re_test_key_123456",
      from: "FORNO <onboarding@resend.dev>",
      onlyTo: "Owner@Example.com",
      fetchImpl,
    });
    expect(await mailer.send({ ...message, to: "ana@example.com" })).toBe("skipped");
    expect(fetchImpl).not.toHaveBeenCalled();

    expect(await mailer.send({ ...message, to: "owner@example.com" })).toBe("sent");
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_test_key_123456");
    expect(JSON.parse(init.body)).toMatchObject({ to: ["owner@example.com"], subject: "Hola" });
  });

  it("treats any non-successful answer as a failure to retry", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}", { status: 403 }));
    const mailer = createResendMailer({ apiKey: "re_test_key_123456", from: "x", fetchImpl });
    await expect(mailer.send(message)).rejects.toThrow("403");
  });
});

describe("order events", () => {
  const event = (orderId: string, status: string, kind: "created" | "status" = "status") => ({
    kind,
    orderId,
    orderNumber: 1,
    status,
  });
  const deps = { mailer: createLogMailer() };
  const templates = async () =>
    (await prisma.notificationLog.findMany({ orderBy: { createdAt: "asc" } })).map(
      (n) => n.template,
    );

  it("sends the right notice for each step (pickup)", async () => {
    const { order } = await orderFor("PICKUP");
    for (const status of ["NEW", "ACCEPTED", "READY", "COMPLETED"]) {
      await handleOrderEvent(prisma, deps, event(order.id, status));
    }
    await handleOrderEvent(prisma, deps, event(order.id, "REJECTED"));
    expect(await templates()).toEqual([
      "ORDER_CONFIRMED",
      "ORDER_ACCEPTED",
      "ORDER_READY",
      "ORDER_COMPLETED",
      "ORDER_REJECTED",
    ]);
  });

  it("does not announce «ready» for delivery orders but does when they leave", async () => {
    const { order } = await orderFor("DELIVERY");
    await handleOrderEvent(prisma, deps, event(order.id, "READY"));
    expect(await templates()).toEqual([]);
    await handleOrderEvent(prisma, deps, event(order.id, "OUT_FOR_DELIVERY"));
    expect(await templates()).toEqual(["ORDER_OUT_FOR_DELIVERY"]);
  });

  it("is idempotent and never fails when the order or the mail provider fail", async () => {
    const { order } = await orderFor();
    await handleOrderEvent(prisma, deps, event(order.id, "ACCEPTED"));
    await handleOrderEvent(prisma, deps, event(order.id, "ACCEPTED"));
    expect(await prisma.notificationLog.count()).toBe(1);

    await expect(
      handleOrderEvent(prisma, { mailer: failing() }, event(order.id, "COMPLETED")),
    ).resolves.toBeUndefined();
    const log = await prisma.notificationLog.findFirstOrThrow({
      where: { template: "ORDER_COMPLETED" },
    });
    expect(log.status).toBe("PENDING");
    await expect(
      handleOrderEvent(prisma, deps, event("00000000-0000-4000-8000-000000000000", "NEW")),
    ).resolves.toBeUndefined();
  });
});

describe("GET /admin/notifications", () => {
  it("is only for administrators and lists the notices with their content", async () => {
    const { order } = await orderFor();
    await enqueueOrderEmail(prisma, order.id, "ORDER_CONFIRMED");
    const admin = await ctx.userWithToken({ username: "admin_1", phone: "+34 600 000 001" });
    await prisma.userRole.create({ data: { userId: admin.user.id, role: "ADMIN" } });
    const staff = await ctx.userWithToken({ username: "staff_1", phone: "+34 600 000 002" });
    await prisma.userRole.create({ data: { userId: staff.user.id, role: "STAFF" } });

    expect((await request(ctx.app).get("/api/v1/admin/notifications")).status).toBe(401);
    expect(
      (await request(ctx.app).get("/api/v1/admin/notifications").set(staff.headers)).status,
    ).toBe(403);

    const list = await request(ctx.app).get("/api/v1/admin/notifications").set(admin.headers);
    expect(list.status).toBe(200);
    expect(list.body.meta.total).toBe(1);
    expect(list.body.data[0]).toMatchObject({
      template: "ORDER_CONFIRMED",
      status: "PENDING",
      orderNumber: order.orderNumber,
    });
    expect(list.body.data[0].body).toMatch(/hemos recibido/i);

    const filtered = await request(ctx.app)
      .get("/api/v1/admin/notifications?status=FAILED")
      .set(admin.headers);
    expect(filtered.body.data).toHaveLength(0);
    expect(
      (await request(ctx.app).get("/api/v1/admin/notifications?status=NOPE").set(admin.headers))
        .status,
    ).toBe(400);
  });
});
