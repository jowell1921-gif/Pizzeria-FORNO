import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { seedDemoData } from "../../prisma/seed-demo-data.js";
import { adjustPoints } from "../../src/modules/loyalty/ledger.service.js";
import { createTestClient, resetDatabase, type PrismaClient } from "../db/helpers.js";
import { createTestApp } from "../helpers/app.js";
import { appWithPayments, createFakeGateway, signedWebhook } from "../helpers/payments.js";

/**
 * Los 10 casos críticos de la sección 16, de punta a punta por la API real y contra PostgreSQL.
 * Es la suite de aceptación: si alguno falla, el producto no está listo. Cada caso lleva también
 * pruebas más finas en el resto de archivos (ver docs/quality/casos-criticos.md).
 */
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
  await prisma.openingHours.deleteMany();
  await prisma.openingHours.createMany({
    data: [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({
      dayOfWeek,
      openMinute: 0,
      closeMinute: 1440,
    })),
  });
});

const api = () => request(ctx.app);
let counter = 0;

async function customer() {
  counter += 1;
  return ctx.userWithToken({ username: `cli${counter}`, phone: "+34 600 000 000" });
}

async function staff(role: "ADMIN" | "STAFF" = "ADMIN") {
  counter += 1;
  const who = await ctx.userWithToken({ username: `adm${counter}`, phone: "+34 600 000 001" });
  await prisma.userRole.create({ data: { userId: who.user.id, role } });
  return who;
}

async function line(slug = "margherita", quantity = 1) {
  const product = await prisma.product.findFirstOrThrow({
    where: { slug },
    include: { optionGroups: { include: { options: true } } },
  });
  const optionIds = product.optionGroups
    .filter((group) => group.required)
    .flatMap((group) => group.options.filter((o) => o.isDefault).map((o) => o.id));
  return { productId: product.id, quantity, optionIds };
}

function order(headers: Record<string, string>, body: object) {
  return api()
    .post("/api/v1/orders")
    .set(headers)
    .set("Idempotency-Key", randomUUID())
    .send({ paymentMethod: "CASH_PICKUP", type: "PICKUP", ...body });
}

async function setStatus(
  adminHeaders: Record<string, string>,
  id: string,
  status: string,
  reason?: string,
) {
  return api()
    .patch(`/api/v1/admin/orders/${id}/status`)
    .set(adminHeaders)
    .send({ status, ...(reason ? { reason } : {}) });
}

async function complete(adminHeaders: Record<string, string>, id: string) {
  for (const status of ["ACCEPTED", "PREPARING", "READY", "COMPLETED"]) {
    const res = await setStatus(adminHeaders, id, status);
    expect(res.status, status).toBe(200);
  }
}

describe("critical cases (section 16)", () => {
  it("1. a customer cannot read another customer's orders", async () => {
    const ana = await customer();
    const luis = await customer();
    const created = await order(ana.headers, { items: [await line("margherita", 2)] });
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;

    expect((await api().get(`/api/v1/orders/${id}`).set(luis.headers)).status).toBe(404);
    expect((await api().get("/api/v1/orders/me").set(luis.headers)).body.data).toEqual([]);
    expect((await api().get(`/api/v1/orders/${id}`).set(ana.headers)).status).toBe(200);
  });

  it("2. a user without authorization cannot enter the administration panel", async () => {
    const plain = await customer();
    expect((await api().get("/api/v1/admin/orders")).status).toBe(401);
    expect((await api().get("/api/v1/admin/orders").set(plain.headers)).status).toBe(403);
    expect(
      (
        await api()
          .patch(`/api/v1/admin/orders/${randomUUID()}/status`)
          .set(plain.headers)
          .send({ status: "ACCEPTED" })
      ).status,
    ).toBe(403);
    expect(
      (
        await api()
          .get("/api/v1/admin/orders")
          .set((await staff("STAFF")).headers)
      ).status,
    ).toBe(200);
  });

  it("3. the price cannot be manipulated from the front end", async () => {
    const who = await customer();
    const item = await line("margherita", 2);
    const product = await prisma.product.findFirstOrThrow({ where: { slug: "margherita" } });

    for (const forged of [
      { unitPrice: "0.01" },
      { price: 0.01 },
      { total: "0.01" },
      { items: [{ ...item, unitPrice: "0.01" }] },
    ]) {
      const res = await order(who.headers, { items: [item], ...forged });
      expect(res.status, JSON.stringify(forged)).toBe(400);
    }
    const created = await order(who.headers, { items: [item] });
    expect(created.status).toBe(201);
    const expected = (Number(product.basePrice) * 2).toFixed(2);
    expect(created.body.data.totals.total).toBe(expected);
    expect(created.body.data.items[0].unitPrice).toBe(product.basePrice.toFixed(2));
  });

  it("4. points are never granted twice for the same order", async () => {
    const admin = await staff();
    const who = await customer();
    const created = await order(who.headers, { items: [await line("margherita", 2)] });
    const id = created.body.data.id as string;
    await complete(admin.headers, id);

    // Completar otra vez (a mano o por un reintento) no concede nada más.
    expect((await setStatus(admin.headers, id, "COMPLETED")).status).toBe(409);
    const earns = await prisma.loyaltyTransaction.count({ where: { orderId: id, type: "EARN" } });
    expect(earns).toBe(1);
    const balance = (await api().get("/api/v1/loyalty/account").set(who.headers)).body.data.balance;
    expect(balance).toBeGreaterThan(0);
    expect((await api().get("/api/v1/loyalty/account").set(who.headers)).body.data.balance).toBe(
      balance,
    );
  });

  it("5. points cannot be redeemed without enough balance", async () => {
    const who = await customer();
    const reward = await prisma.reward.findFirstOrThrow({ where: { pointsCost: 100 } });
    const res = await api()
      .post("/api/v1/loyalty/redemptions")
      .set(who.headers)
      .set("Idempotency-Key", randomUUID())
      .send({ rewardId: reward.id });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INSUFFICIENT_POINTS");
    expect(await prisma.rewardRedemption.count()).toBe(0);
  });

  it("6. two simultaneous requests cannot spend the same points", async () => {
    const who = await customer();
    await adjustPoints(prisma, {
      userId: who.user.id,
      actorId: who.user.id,
      points: 100,
      reason: "Alta de prueba",
    });
    const reward = await prisma.reward.findFirstOrThrow({ where: { pointsCost: 100 } });
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        api()
          .post("/api/v1/loyalty/redemptions")
          .set(who.headers)
          .set("Idempotency-Key", randomUUID())
          .send({ rewardId: reward.id }),
      ),
    );
    expect(results.filter((res) => res.status === 201)).toHaveLength(1);
    expect((await api().get("/api/v1/loyalty/account").set(who.headers)).body.data.balance).toBe(0);
  });

  it("7. a failed payment never produces a paid order", async () => {
    await prisma.storeSettings.update({
      where: { id: 1 },
      data: { enabledPaymentMethods: ["ONLINE", "CASH_PICKUP", "CASH_DELIVERY"] },
    });
    const fake = createFakeGateway();
    const app = appWithPayments(prisma, ctx, fake.gateway);
    const who = await customer();
    const created = await request(app)
      .post("/api/v1/orders")
      .set(who.headers)
      .set("Idempotency-Key", randomUUID())
      .send({ items: [await line("margherita", 2)], type: "PICKUP", paymentMethod: "ONLINE" });
    const id = created.body.data.id as string;
    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: id } });
    const meta = { orderId: id, paymentId: payment.id };

    await signedWebhook(app, {
      type: "payment_intent.payment_failed",
      object: { id: "pi_1", metadata: meta, last_payment_error: { message: "declined" } },
    });
    await signedWebhook(app, {
      type: "checkout.session.expired",
      object: { id: "cs_1", metadata: meta },
    });

    const after = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(after.status).toBe("FAILED");
    expect(after.paidAt).toBeNull();
    expect((await prisma.order.findUniqueOrThrow({ where: { id } })).status).toBe("CANCELLED");
    expect(await prisma.payment.count({ where: { status: "PAID" } })).toBe(0);
  });

  it("8. a cancelled order reverses the points already granted", async () => {
    const admin = await staff();
    const who = await customer();
    const created = await order(who.headers, { items: [await line("margherita", 2)] });
    const id = created.body.data.id as string;
    await complete(admin.headers, id);
    const earned = (await api().get("/api/v1/loyalty/account").set(who.headers)).body.data.balance;
    expect(earned).toBeGreaterThan(0);

    expect((await setStatus(admin.headers, id, "CANCELLED", "Devolución del cliente")).status).toBe(
      200,
    );
    expect((await api().get("/api/v1/loyalty/account").set(who.headers)).body.data.balance).toBe(0);
    const types = (
      await prisma.loyaltyTransaction.findMany({
        where: { orderId: id },
        orderBy: { createdAt: "asc" },
      })
    ).map((t) => t.type);
    expect(types).toEqual(["EARN", "REVERSAL"]);
  });

  it("9. an invalid delivery zone prevents the home-delivery order", async () => {
    const who = await customer();
    const outside = await prisma.address.create({
      data: {
        userId: who.user.id,
        recipientName: "Cliente",
        line1: "Calle 1",
        postalCode: "08001",
        city: "Barcelona",
      },
    });
    const res = await order(who.headers, {
      items: [await line("margherita", 3)],
      type: "DELIVERY",
      addressId: outside.id,
      paymentMethod: "CASH_DELIVERY",
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("OUTSIDE_DELIVERY_ZONE");
    expect(await prisma.order.count()).toBe(0);
  });

  it("10. an order below the minimum is rejected when the minimum is configured", async () => {
    const who = await customer();
    const inside = await prisma.address.create({
      data: {
        userId: who.user.id,
        recipientName: "Cliente",
        line1: "Calle 1",
        postalCode: "28001",
        city: "Madrid",
      },
    });
    const res = await order(who.headers, {
      items: [await line("margherita", 1)],
      type: "DELIVERY",
      addressId: inside.id,
      paymentMethod: "CASH_DELIVERY",
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("BELOW_MINIMUM_ORDER");
    expect(res.body.error.details.minimumOrder).toBe("12.00");
    expect(await prisma.order.count()).toBe(0);
  });
});
