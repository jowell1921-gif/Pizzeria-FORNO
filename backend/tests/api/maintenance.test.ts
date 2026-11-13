import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { seedDemoData } from "../../prisma/seed-demo-data.js";
import {
  ABANDONED_PAYMENT_MINUTES,
  cancelAbandonedPaymentOrders,
  purgeExpiredIdempotencyRecords,
} from "../../src/modules/orders/maintenance.service.js";
import { createTestClient, resetDatabase, type PrismaClient } from "../db/helpers.js";
import { createTestApp } from "../helpers/app.js";
import { appWithPayments, createFakeGateway } from "../helpers/payments.js";

let prisma: PrismaClient;
let ctx: Awaited<ReturnType<typeof createTestApp>>;
let app: ReturnType<typeof appWithPayments>;

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
  await prisma.openingHours.deleteMany();
  await prisma.openingHours.createMany({
    data: [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({
      dayOfWeek,
      openMinute: 0,
      closeMinute: 1440,
    })),
  });
  await prisma.storeSettings.update({
    where: { id: 1 },
    data: { enabledPaymentMethods: ["ONLINE", "CASH_PICKUP", "CASH_DELIVERY"] },
  });
  app = appWithPayments(prisma, ctx, createFakeGateway().gateway);
});

async function margherita() {
  const product = await prisma.product.findFirstOrThrow({
    where: { slug: "margherita" },
    include: { optionGroups: { include: { options: true } } },
  });
  const optionIds = product.optionGroups
    .filter((group) => group.required)
    .flatMap((group) =>
      group.options.filter((option) => option.isDefault).map((option) => option.id),
    );
  return { productId: product.id, quantity: 1, optionIds };
}

/** Pedido creado por la API; `method` decide si queda pendiente de pago (ONLINE) o en efectivo. */
async function order(method: "ONLINE" | "CASH_PICKUP") {
  const owner = await ctx.userWithToken({
    username: `cliente${randomUUID().slice(0, 4)}`,
    phone: "+34 600 000 000",
  });
  const response = await request(app)
    .post("/api/v1/orders")
    .set(owner.headers)
    .set("Idempotency-Key", randomUUID())
    .send({ items: [await margherita()], type: "PICKUP", paymentMethod: method });
  expect(response.status).toBe(201);
  return response.body.data.id as string;
}

/** Retrasa la última actividad del pago online, como si hubiera pasado ese tiempo. */
async function ageOnlinePayment(orderId: string, minutesAgo: number) {
  await prisma.payment.updateMany({
    where: { orderId, method: "ONLINE" },
    data: { updatedAt: new Date(Date.now() - minutesAgo * 60_000) },
  });
}

describe("abandoned online orders", () => {
  it("cancels an online order that never got paid and frees what it held", async () => {
    const id = await order("ONLINE");
    await ageOnlinePayment(id, ABANDONED_PAYMENT_MINUTES + 5);

    expect(await cancelAbandonedPaymentOrders(prisma)).toBe(1);

    const cancelled = await prisma.order.findUniqueOrThrow({
      where: { id },
      include: { payments: true, statusHistory: true },
    });
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.cancellationReason).toBe("Pago no completado");
    expect(cancelled.payments[0]).toMatchObject({ status: "FAILED", failureReason: "ABANDONED" });
    // El cambio lo hace el sistema: queda en el historial sin autor.
    expect(cancelled.statusHistory.at(-1)).toMatchObject({
      toStatus: "CANCELLED",
      changedById: null,
    });
  });

  it("leaves alone recent online orders, cash orders and paid orders", async () => {
    const recent = await order("ONLINE");
    await ageOnlinePayment(recent, ABANDONED_PAYMENT_MINUTES - 10);
    const cash = await order("CASH_PICKUP");
    const paid = await order("ONLINE");
    await ageOnlinePayment(paid, ABANDONED_PAYMENT_MINUTES + 5);
    await prisma.payment.updateMany({
      where: { orderId: paid, method: "ONLINE" },
      data: { status: "PAID", paidAt: new Date(), updatedAt: new Date(Date.now() - 3_600_000) },
    });
    await prisma.order.update({ where: { id: paid }, data: { status: "NEW" } });

    expect(await cancelAbandonedPaymentOrders(prisma)).toBe(0);
    const statuses = await prisma.order.findMany({
      where: { id: { in: [recent, cash, paid] } },
      select: { id: true, status: true },
    });
    expect(Object.fromEntries(statuses.map((item) => [item.id, item.status]))).toEqual({
      [recent]: "PENDING_PAYMENT",
      [cash]: "NEW",
      [paid]: "NEW",
    });
  });

  it("is idempotent: running it again changes nothing", async () => {
    const id = await order("ONLINE");
    await ageOnlinePayment(id, ABANDONED_PAYMENT_MINUTES + 5);
    expect(await cancelAbandonedPaymentOrders(prisma)).toBe(1);
    expect(await cancelAbandonedPaymentOrders(prisma)).toBe(0);
    expect((await prisma.order.findUniqueOrThrow({ where: { id } })).status).toBe("CANCELLED");
  });
});

describe("idempotency records", () => {
  it("purges only the expired ones", async () => {
    const user = await ctx.userWithToken({ username: "idem", phone: "+34 600 000 001" });
    const oldKey = randomUUID();
    const freshKey = randomUUID();
    const base = { userId: user.user.id, endpoint: "POST /orders", requestHash: "h" };
    await prisma.idempotencyRecord.createMany({
      data: [
        {
          ...base,
          key: oldKey,
          createdAt: new Date(Date.now() - 7_200_000),
          expiresAt: new Date(Date.now() - 3_600_000),
        },
        { ...base, key: freshKey, expiresAt: new Date(Date.now() + 3_600_000) },
      ],
    });
    expect(await purgeExpiredIdempotencyRecords(prisma)).toBe(1);
    expect((await prisma.idempotencyRecord.findMany()).map((record) => record.key)).toEqual([
      freshKey,
    ]);
  });
});

describe("caching of private data", () => {
  it("marks every authenticated response as not cacheable, and public data as cacheable", async () => {
    const { headers } = await ctx.userWithToken({ username: "cache", phone: "+34 600 000 002" });
    const me = await request(ctx.app).get("/api/v1/me").set(headers);
    expect(me.status).toBe(200);
    expect(me.headers["cache-control"]).toBe("private, no-store");
    const orders = await request(ctx.app).get("/api/v1/orders/me").set(headers);
    expect(orders.headers["cache-control"]).toBe("private, no-store");

    const menu = await request(ctx.app).get("/api/v1/products");
    expect(menu.headers["cache-control"]).toMatch(/^public, max-age=/);
  });
});
