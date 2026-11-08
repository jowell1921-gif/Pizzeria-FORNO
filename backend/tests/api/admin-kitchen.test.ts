import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { seedDemoData } from "../../prisma/seed-demo-data.js";
import {
  AdminOrder,
  AdminOrderSummary,
  Dashboard,
  KitchenOrder,
  data,
  paged,
} from "../../src/docs/schemas.js";
import { changeOrderStatus } from "../../src/modules/orders/status.service.js";
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
  await prisma.storeSettings.update({ where: { id: 1 }, data: { loyaltyPointsPerEuro: "1.0000" } });
});

const api = () => request(ctx.app);

type Role = "ADMIN" | "STAFF" | "KITCHEN";
/** Usuario autenticado con un rol del personal (los roles se leen de la base de datos). */
async function withRole(role: Role) {
  const current = await ctx.userWithToken({
    username: `u_${role}`.slice(0, 12),
    phone: "+34 600 000 001",
  });
  await prisma.userRole.create({ data: { userId: current.user.id, role } });
  return current;
}

const customer = () => ctx.userWithToken({ username: "cliente1", phone: "+34 600 000 002" });

async function newOrder(userId: string, options: Partial<Parameters<typeof createOrder>[1]> = {}) {
  const product = await createProduct(prisma);
  return createOrder(prisma, { userId, productId: product.id, ...options });
}

describe("access control", () => {
  const adminPaths = ["/api/v1/admin/orders", "/api/v1/admin/dashboard", "/api/v1/admin/stream"];
  const kitchenPaths = ["/api/v1/kitchen/orders", "/api/v1/kitchen/stream"];

  it("requires a session for the panel and the kitchen", async () => {
    for (const path of [...adminPaths, ...kitchenPaths]) {
      expect((await api().get(path)).status, path).toBe(401);
    }
    expect((await api().patch("/api/v1/admin/orders/x/status").send({})).status).toBe(401);
  });

  it("forbids customers from every staff route", async () => {
    const { headers } = await customer();
    for (const path of [...adminPaths, ...kitchenPaths]) {
      expect((await api().get(path).set(headers)).status, path).toBe(403);
    }
    const body = { status: "ACCEPTED" };
    expect(
      (await api().patch("/api/v1/admin/orders/x/status").set(headers).send(body)).status,
    ).toBe(403);
    expect(
      (await api().patch("/api/v1/kitchen/orders/x/status").set(headers).send(body)).status,
    ).toBe(403);
  });

  it("lets the kitchen see the kitchen screen but nothing of the administration", async () => {
    const { headers } = await withRole("KITCHEN");
    expect((await api().get("/api/v1/kitchen/orders").set(headers)).status).toBe(200);
    for (const path of adminPaths) {
      expect((await api().get(path).set(headers)).status, path).toBe(403);
    }
    const { user } = await customer();
    const order = await newOrder(user.id);
    expect(
      (
        await api()
          .patch(`/api/v1/admin/orders/${order.id}/status`)
          .set(headers)
          .send({ status: "ACCEPTED" })
      ).status,
    ).toBe(403);
  });

  it("lets staff and admins use both, and ignores any role the client claims", async () => {
    for (const role of ["STAFF", "ADMIN"] as const) {
      const { headers } = await withRole(role);
      expect((await api().get("/api/v1/admin/orders").set(headers)).status).toBe(200);
      expect((await api().get("/api/v1/kitchen/orders").set(headers)).status).toBe(200);
    }
    const { headers } = await customer();
    const forged = await api().get("/api/v1/admin/orders").set(headers).set("X-Role", "ADMIN");
    expect(forged.status).toBe(403);
  });
});

describe("admin orders", () => {
  it("lists, filters and paginates orders", async () => {
    const { headers } = await withRole("STAFF");
    const { user } = await customer();
    const first = await newOrder(user.id, { type: "DELIVERY" });
    await newOrder(user.id);
    await newOrder(user.id);

    const all = await api().get("/api/v1/admin/orders").set(headers);
    paged(AdminOrderSummary).parse(all.body);
    expect(all.body.meta.total).toBe(3);

    const delivery = await api().get("/api/v1/admin/orders?type=DELIVERY").set(headers);
    expect(delivery.body.data.map((item: { id: string }) => item.id)).toEqual([first.id]);

    const byNumber = await api().get(`/api/v1/admin/orders?q=${first.orderNumber}`).set(headers);
    expect(byNumber.body.data).toHaveLength(1);
    const byName = await api().get("/api/v1/admin/orders?q=cliente de PRUEBA").set(headers);
    expect(byName.body.data).toHaveLength(3);

    const page = await api().get("/api/v1/admin/orders?pageSize=2&page=2").set(headers);
    expect(page.body.data).toHaveLength(1);
    expect(page.body.meta).toMatchObject({ page: 2, pageSize: 2, total: 3, totalPages: 2 });

    expect(
      (await api().get("/api/v1/admin/orders?status=NEW,ACCEPTED").set(headers)).body.data,
    ).toHaveLength(3);
    expect(
      (await api().get("/api/v1/admin/orders?status=COMPLETED").set(headers)).body.data,
    ).toHaveLength(0);
    expect((await api().get("/api/v1/admin/orders?status=NOPE").set(headers)).status).toBe(400);
    expect((await api().get("/api/v1/admin/orders?date=ayer").set(headers)).status).toBe(400);
  });

  it("filters by the day the order was placed, in the store time zone", async () => {
    const { headers } = await withRole("STAFF");
    const { user } = await customer();
    const old = await newOrder(user.id);
    await prisma.order.update({
      where: { id: old.id },
      data: { placedAt: new Date("2026-03-01T10:00:00Z") },
    });
    await newOrder(user.id);

    const day = await api().get("/api/v1/admin/orders?date=2026-03-01").set(headers);
    expect(day.body.data.map((item: { id: string }) => item.id)).toEqual([old.id]);
    expect(
      (await api().get("/api/v1/admin/orders?date=2026-03-02").set(headers)).body.data,
    ).toHaveLength(0);
  });

  it("shows the full detail with the valid next statuses and the history", async () => {
    const { headers } = await withRole("STAFF");
    const { user } = await customer();
    const order = await newOrder(user.id, { type: "DELIVERY" });
    await prisma.payment.create({
      data: {
        orderId: order.id,
        method: "CASH_DELIVERY",
        status: "CASH_PENDING",
        amount: order.total,
      },
    });

    const detail = await api().get(`/api/v1/admin/orders/${order.id}`).set(headers);
    expect(detail.status).toBe(200);
    const parsed = data(AdminOrder).parse(detail.body).data;
    expect(parsed.customer).toMatchObject({
      name: "Cliente de Prueba",
      email: "cliente@example.test",
    });
    expect(parsed.delivery).toMatchObject({ line1: "Calle Ejemplo 1", postalCode: "28001" });
    expect(parsed.payments).toEqual([
      expect.objectContaining({ method: "CASH_DELIVERY", status: "CASH_PENDING" }),
    ]);
    expect(parsed.allowedNext).toEqual(["ACCEPTED", "REJECTED", "CANCELLED"]);

    expect((await api().get("/api/v1/admin/orders/no-uuid").set(headers)).status).toBe(404);
    expect(
      (await api().get("/api/v1/admin/orders/11111111-1111-4111-8111-111111111111").set(headers))
        .status,
    ).toBe(404);
  });

  it("does not offer delivery statuses on pickup orders", async () => {
    const { headers } = await withRole("STAFF");
    const { user } = await customer();
    const order = await newOrder(user.id);
    const staff = await withRole("STAFF");
    for (const to of ["ACCEPTED", "PREPARING", "READY"] as const) {
      await changeOrderStatus(prisma, { orderId: order.id, to, actorId: staff.user.id });
    }
    const detail = await api().get(`/api/v1/admin/orders/${order.id}`).set(headers);
    expect(detail.body.data.allowedNext).toEqual(["COMPLETED", "CANCELLED"]);
  });
});

describe("changing the status", () => {
  it("moves an order through its life, grants the points and audits the staff actions", async () => {
    const staff = await withRole("STAFF");
    const { user } = await customer();
    const order = await newOrder(user.id); // 2 x 10,00
    const patch = (status: string, reason?: string) =>
      api()
        .patch(`/api/v1/admin/orders/${order.id}/status`)
        .set(staff.headers)
        .send({ status, ...(reason ? { reason } : {}) });

    for (const status of ["ACCEPTED", "PREPARING", "READY", "COMPLETED"]) {
      const response = await patch(status);
      expect(response.status, status).toBe(200);
      data(AdminOrder).parse(response.body);
      expect(response.body.data.status).toBe(status);
    }
    expect(
      (await prisma.loyaltyAccount.findUniqueOrThrow({ where: { userId: user.id } })).balance,
    ).toBe(20);
    const audits = await prisma.auditLog.findMany({
      where: { action: "order.status", entityId: order.id },
    });
    expect(audits).toHaveLength(4);
    expect(audits[0]).toMatchObject({ actorId: staff.user.id, entityType: "Order" });
    const detail = await api().get(`/api/v1/admin/orders/${order.id}`).set(staff.headers);
    expect(detail.body.data.history.at(-1)).toMatchObject({
      status: "COMPLETED",
      by: "Cliente de Prueba",
    });
  });

  it("rejects invalid changes, requires reasons and answers 404 for unknown orders", async () => {
    const staff = await withRole("STAFF");
    const { user } = await customer();
    const order = await newOrder(user.id);
    const url = `/api/v1/admin/orders/${order.id}/status`;

    const skip = await api().patch(url).set(staff.headers).send({ status: "COMPLETED" });
    expect(skip.status).toBe(409);
    expect(skip.body.error.code).toBe("INVALID_TRANSITION");
    expect(
      (await api().patch(url).set(staff.headers).send({ status: "REJECTED" })).body.error.code,
    ).toBe("REASON_REQUIRED");
    expect((await api().patch(url).set(staff.headers).send({ status: "BOGUS" })).status).toBe(400);
    expect(
      (await api().patch(url).set(staff.headers).send({ status: "ACCEPTED", extra: 1 })).status,
    ).toBe(400);

    const rejected = await api()
      .patch(url)
      .set(staff.headers)
      .send({ status: "REJECTED", reason: "Sin existencias" });
    expect(rejected.status).toBe(200);
    expect(rejected.body.data).toMatchObject({
      status: "REJECTED",
      cancellationReason: "Sin existencias",
    });
    expect(
      (
        await api()
          .patch("/api/v1/admin/orders/11111111-1111-4111-8111-111111111111/status")
          .set(staff.headers)
          .send({ status: "ACCEPTED" })
      ).status,
    ).toBe(404);
  });
});

describe("kitchen", () => {
  it("shows what to prepare and nothing about the customer, the money or the payment", async () => {
    const kitchen = await withRole("KITCHEN");
    const { user } = await customer();
    const order = await newOrder(user.id, { type: "DELIVERY" });
    await prisma.orderItem.updateMany({
      where: { orderId: order.id },
      data: { notes: "Sin albahaca" },
    });
    await prisma.order.update({ where: { id: order.id }, data: { notes: "Llamar al timbre" } });
    await prisma.payment.create({
      data: {
        orderId: order.id,
        method: "CASH_DELIVERY",
        status: "CASH_PENDING",
        amount: order.total,
      },
    });

    const response = await api().get("/api/v1/kitchen/orders").set(kitchen.headers);
    data(KitchenOrder.array()).parse(response.body);
    const [shown] = response.body.data;
    expect(shown).toMatchObject({
      orderNumber: order.orderNumber,
      status: "NEW",
      type: "DELIVERY",
      notes: "Llamar al timbre",
    });
    expect(shown.items[0]).toMatchObject({ quantity: 2, notes: "Sin albahaca" });

    const text = JSON.stringify(response.body);
    for (const secret of [
      "Cliente de Prueba",
      "cliente@example.test",
      "Calle Ejemplo",
      "28001",
      "20.00",
      "CASH_DELIVERY",
      user.id,
    ]) {
      expect(text, secret).not.toContain(secret);
    }
    for (const key of ["customer", "delivery", "totals", "payments", "total"]) {
      expect(shown).not.toHaveProperty(key);
    }
  });

  it("lists in-progress orders and hides old completed ones", async () => {
    const kitchen = await withRole("KITCHEN");
    const { user } = await customer();
    const staff = await withRole("STAFF");
    const active = await newOrder(user.id);
    const recent = await newOrder(user.id);
    const old = await newOrder(user.id);
    const cancelled = await newOrder(user.id);
    for (const id of [recent.id, old.id]) {
      for (const to of ["ACCEPTED", "PREPARING", "READY", "COMPLETED"] as const) {
        await changeOrderStatus(prisma, { orderId: id, to, actorId: staff.user.id });
      }
    }
    await prisma.order.update({
      where: { id: old.id },
      data: { completedAt: new Date(Date.now() - 4 * 3_600_000) },
    });
    await changeOrderStatus(prisma, {
      orderId: cancelled.id,
      to: "CANCELLED",
      actorId: staff.user.id,
    });

    const ids = (await api().get("/api/v1/kitchen/orders").set(kitchen.headers)).body.data.map(
      (item: { id: string }) => item.id,
    );
    expect(ids).toContain(active.id);
    expect(ids).toContain(recent.id);
    expect(ids).not.toContain(old.id);
    expect(ids).not.toContain(cancelled.id);
  });

  it("lets the kitchen advance orders, but not skip steps, reject, cancel or close deliveries", async () => {
    const kitchen = await withRole("KITCHEN");
    const { user } = await customer();
    const pickup = await newOrder(user.id);
    const delivery = await newOrder(user.id, { type: "DELIVERY" });
    const patch = (id: string, status: string) =>
      api().patch(`/api/v1/kitchen/orders/${id}/status`).set(kitchen.headers).send({ status });

    expect((await patch(pickup.id, "PREPARING")).status).toBe(403); // salta «aceptado»
    for (const status of ["ACCEPTED", "PREPARING", "READY"]) {
      const response = await patch(pickup.id, status);
      expect(response.status, status).toBe(200);
      data(KitchenOrder).parse(response.body);
    }
    expect((await patch(pickup.id, "COMPLETED")).body.data.status).toBe("COMPLETED");

    for (const status of ["ACCEPTED", "PREPARING", "READY"]) await patch(delivery.id, status);
    const blocked = await patch(delivery.id, "COMPLETED");
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("KITCHEN_TRANSITION_NOT_ALLOWED");

    for (const status of ["REJECTED", "CANCELLED", "OUT_FOR_DELIVERY"]) {
      expect((await patch(delivery.id, status)).status, status).toBe(400);
    }
    expect((await patch("11111111-1111-4111-8111-111111111111", "ACCEPTED")).status).toBe(404);
  });
});

describe("dashboard", () => {
  it("counts today's orders by state, the sales and the popular products", async () => {
    const staff = await withRole("STAFF");
    const { user } = await customer();
    const product = await createProduct(prisma);
    const make = (quantity: number) =>
      createOrder(prisma, { userId: user.id, productId: product.id, quantity, unitPrice: "10.00" });

    const newOne = await make(1);
    const preparing = await make(1);
    const done = await make(2); // 20,00
    const done2 = await make(1); // 10,00
    const cancelled = await make(3);
    const old = await make(5);
    await prisma.order.update({
      where: { id: old.id },
      data: { placedAt: new Date(Date.now() - 3 * 86_400_000) },
    });

    const step = (id: string, ...to: Array<Parameters<typeof changeOrderStatus>[1]["to"]>) =>
      to.reduce(
        (previous, status) =>
          previous.then(() =>
            changeOrderStatus(prisma, { orderId: id, to: status, actorId: staff.user.id }),
          ),
        Promise.resolve<unknown>(undefined),
      );
    await step(preparing.id, "ACCEPTED", "PREPARING");
    await step(done.id, "ACCEPTED", "PREPARING", "READY", "COMPLETED");
    await step(done2.id, "ACCEPTED", "PREPARING", "READY", "COMPLETED");
    await step(cancelled.id, "CANCELLED");

    const response = await api().get("/api/v1/admin/dashboard").set(staff.headers);
    expect(response.status).toBe(200);
    const dashboard = data(Dashboard).parse(response.body).data;
    expect(dashboard.orders).toEqual({
      total: 5,
      pending: 1,
      preparing: 1,
      ready: 0,
      completed: 2,
      cancelled: 1,
    });
    expect(dashboard.sales).toEqual({
      completed: "30.00",
      inProgress: "20.00",
      averageTicket: "15.00",
    });
    // Productos más pedidos de los últimos 7 días, sin contar los cancelados.
    expect(dashboard.popularProducts[0]).toMatchObject({ quantity: 10 }); // 1+1+2+1+5
    expect(dashboard.recentOrders.length).toBeGreaterThan(0);
    expect(newOne.id).toBeTruthy();
  });

  it("answers with zeros on a quiet day", async () => {
    const staff = await withRole("STAFF");
    const dashboard = (await api().get("/api/v1/admin/dashboard").set(staff.headers)).body.data;
    expect(dashboard.orders.total).toBe(0);
    expect(dashboard.sales).toEqual({
      completed: "0.00",
      inProgress: "0.00",
      averageTicket: "0.00",
    });
    expect(dashboard.popularProducts).toEqual([]);
  });
});

describe("live updates (SSE)", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = createServer(ctx.app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  /** Abre el flujo y devuelve lo recibido hasta que aparece `until` (o hasta agotar el tiempo). */
  async function listen(
    headers: Record<string, string>,
    path: string,
    until: RegExp,
    trigger?: () => Promise<unknown>,
  ) {
    const controller = new AbortController();
    const response = await fetch(`${baseUrl}${path}`, { headers, signal: controller.signal });
    if (!response.ok || !response.body) {
      controller.abort();
      return { status: response.status, text: "", type: response.headers.get("content-type") };
    }
    const reader = response.body.getReader();
    let text = "";
    const triggered = trigger ? trigger() : Promise.resolve();
    const deadline = Date.now() + 8_000;
    while (!until.test(text) && Date.now() < deadline) {
      const chunk = await Promise.race([
        reader.read(),
        new Promise<{ done: true; value: undefined }>((resolve) =>
          setTimeout(() => resolve({ done: true, value: undefined }), 8_000),
        ),
      ]);
      if (chunk.done) break;
      text += new TextDecoder().decode(chunk.value);
    }
    controller.abort();
    await triggered;
    return { status: response.status, text, type: response.headers.get("content-type") };
  }

  it("streams status changes to the kitchen without personal data", async () => {
    const kitchen = await withRole("KITCHEN");
    const staff = await withRole("STAFF");
    const { user } = await customer();
    const order = await newOrder(user.id);

    const result = await listen(
      kitchen.headers,
      "/api/v1/kitchen/stream",
      /event: order/,
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 300));
        await changeOrderStatus(prisma, {
          orderId: order.id,
          to: "ACCEPTED",
          actorId: staff.user.id,
        });
      },
    );

    expect(result.status).toBe(200);
    expect(result.type).toMatch(/text\/event-stream/);
    const payload = /data: (.+)\n/.exec(result.text)?.[1];
    expect(JSON.parse(payload ?? "{}")).toEqual({
      kind: "status",
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: "ACCEPTED",
    });
    expect(result.text).not.toContain("Cliente de Prueba");
  });

  it("refuses the stream without a session or permission", async () => {
    const { headers } = await customer();
    expect((await listen({}, "/api/v1/kitchen/stream", /x/)).status).toBe(401);
    expect((await listen(headers, "/api/v1/kitchen/stream", /x/)).status).toBe(403);
    const kitchen = await withRole("KITCHEN");
    expect((await listen(kitchen.headers, "/api/v1/admin/stream", /x/)).status).toBe(403);
  });
});
