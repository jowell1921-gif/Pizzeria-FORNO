import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { seedDemoData } from "../../prisma/seed-demo-data.js";
import { adjustPoints, redeemReward } from "../../src/modules/loyalty/ledger.service.js";
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

async function withRole(role: "ADMIN" | "STAFF") {
  const current = await ctx.userWithToken({ username: `u_${role}`, phone: "+34 600 000 001" });
  await prisma.userRole.create({ data: { userId: current.user.id, role } });
  return current;
}
const customer = (overrides: Record<string, unknown> = {}) =>
  ctx.userWithToken({ username: "cliente1", phone: "+34 600 000 002", ...overrides });

describe("points rule", () => {
  it("changes the conversion and the expiry, audits it and the public program follows", async () => {
    const { user, headers } = await withRole("ADMIN");
    expect((await api().get("/api/v1/admin/loyalty/settings").set(headers)).body.data).toEqual({
      pointsPerEuro: "1",
      expiryDays: null,
    });

    const patched = await api()
      .patch("/api/v1/admin/loyalty/settings")
      .set(headers)
      .send({ pointsPerEuro: "2.5", expiryDays: 365 });
    expect(patched.body.data).toEqual({ pointsPerEuro: "2.5", expiryDays: 365 });
    expect((await api().get("/api/v1/loyalty/program")).body.data).toMatchObject({
      pointsPerEuro: "2.5",
      expiryDays: 365,
    });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "loyalty.settings" } });
    expect(audit).toMatchObject({ actorId: user.id });
    expect(audit.before).toEqual({ pointsPerEuro: "1", expiryDays: null });
    expect(audit.after).toEqual({ pointsPerEuro: "2.5", expiryDays: 365 });

    // Se puede quitar la caducidad.
    expect(
      (await api().patch("/api/v1/admin/loyalty/settings").set(headers).send({ expiryDays: null }))
        .body.data.expiryDays,
    ).toBeNull();
  });

  it("uses the new conversion for the points of orders completed afterwards", async () => {
    const { headers } = await withRole("ADMIN");
    const staff = await withRole("STAFF");
    const buyer = await customer();
    const product = await createProduct(prisma);
    const placed = await createOrder(prisma, { userId: buyer.user.id, productId: product.id }); // 20,00
    await api().patch("/api/v1/admin/loyalty/settings").set(headers).send({ pointsPerEuro: "2" });
    for (const to of ["ACCEPTED", "PREPARING", "READY", "COMPLETED"] as const) {
      await changeOrderStatus(prisma, { orderId: placed.id, to, actorId: staff.user.id });
    }
    expect((await api().get("/api/v1/loyalty/account").set(buyer.headers)).body.data.balance).toBe(
      40,
    );
  });

  it("validates the values", async () => {
    const { headers } = await withRole("ADMIN");
    for (const body of [
      {},
      { pointsPerEuro: "-1" },
      { pointsPerEuro: "abc" },
      { pointsPerEuro: "1.23456" },
      { pointsPerEuro: 2 },
      { expiryDays: 0 },
      { expiryDays: 99999 },
      { extra: 1 },
    ]) {
      expect(
        (await api().patch("/api/v1/admin/loyalty/settings").set(headers).send(body)).status,
        JSON.stringify(body),
      ).toBe(400);
    }
  });
});

describe("rewards", () => {
  it("creates, edits and deletes rewards, and the public program follows", async () => {
    const { headers } = await withRole("ADMIN");
    const pizza = await prisma.product.findFirstOrThrow({ where: { slug: "diavola" } });
    const created = await api()
      .post("/api/v1/admin/rewards")
      .set(headers)
      .send({ name: "Diavola gratis", pointsCost: 500, freeProductId: pizza.id, stock: 10 });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      name: "Diavola gratis",
      pointsCost: 500,
      freeProduct: { name: "Diavola" },
      discountAmount: null,
      stock: 10,
      active: true,
      redemptions: 0,
    });
    expect(
      (await api().get("/api/v1/loyalty/program")).body.data.rewards.map(
        (reward: { name: string }) => reward.name,
      ),
    ).toContain("Diavola gratis");

    // De «producto gratis» a «descuento»: se envía el nuevo beneficio y null en el otro.
    const edited = await api()
      .patch(`/api/v1/admin/rewards/${created.body.data.id}`)
      .set(headers)
      .send({ freeProductId: null, discountAmount: "5.00", pointsCost: 300 });
    expect(edited.body.data).toMatchObject({
      freeProduct: null,
      discountAmount: "5.00",
      pointsCost: 300,
      stock: 10,
      name: "Diavola gratis",
    });

    await api()
      .patch(`/api/v1/admin/rewards/${created.body.data.id}`)
      .set(headers)
      .send({ active: false });
    expect(
      (await api().get("/api/v1/loyalty/program")).body.data.rewards.map(
        (reward: { name: string }) => reward.name,
      ),
    ).not.toContain("Diavola gratis");
    // Editar otro campo no reactiva la recompensa.
    const renamed = await api()
      .patch(`/api/v1/admin/rewards/${created.body.data.id}`)
      .set(headers)
      .send({ name: "5 euros" });
    expect(renamed.body.data).toMatchObject({ name: "5 euros", active: false });

    expect(
      (await api().delete(`/api/v1/admin/rewards/${created.body.data.id}`).set(headers)).status,
    ).toBe(204);
    expect((await api().get("/api/v1/admin/rewards").set(headers)).body.data).toHaveLength(3);
    expect(
      (await api().delete(`/api/v1/admin/rewards/${created.body.data.id}`).set(headers)).status,
    ).toBe(404);
    const actions = (
      await prisma.auditLog.findMany({
        where: { entityType: "Reward" },
        orderBy: { createdAt: "asc" },
      })
    ).map((entry) => entry.action);
    expect(actions).toEqual([
      "reward.create",
      "reward.update",
      "reward.update",
      "reward.update",
      "reward.delete",
    ]);
  });

  it("requires exactly one benefit and valid values", async () => {
    const { headers } = await withRole("ADMIN");
    const pizza = await prisma.product.findFirstOrThrow({ where: { slug: "diavola" } });
    const post = (body: object) =>
      api()
        .post("/api/v1/admin/rewards")
        .set(headers)
        .send({ name: "Premio", pointsCost: 100, ...body });
    for (const body of [
      {},
      { freeProductId: pizza.id, discountAmount: "5.00" },
      { discountAmount: "0.00" },
      { discountAmount: "abc" },
      { discountAmount: "5.00", pointsCost: 0 },
      { discountAmount: "5.00", stock: -1 },
      {
        discountAmount: "5.00",
        validFrom: "2030-02-01T00:00:00.000Z",
        validTo: "2030-01-01T00:00:00.000Z",
      },
      { discountAmount: "5.00", extra: true },
    ]) {
      expect((await post(body)).status, JSON.stringify(body)).toBe(400);
    }
    expect((await post({ freeProductId: randomUUID() })).body.error.code).toBe("PRODUCT_NOT_FOUND");
    expect((await post({ discountAmount: "5.00" })).status).toBe(201);
    expect(
      (
        await api()
          .patch(`/api/v1/admin/rewards/${randomUUID()}`)
          .set(headers)
          .send({ name: "Nada" })
      ).status,
    ).toBe(404);
  });

  it("keeps redeemed rewards usable after the reward is deleted, and lists the redemptions", async () => {
    const { headers } = await withRole("ADMIN");
    const staff = await withRole("STAFF");
    const buyer = await customer();
    await adjustPoints(prisma, {
      userId: buyer.user.id,
      actorId: staff.user.id,
      points: 150,
      reason: "Alta",
    });
    const reward = await prisma.reward.findFirstOrThrow({ where: { pointsCost: 100 } });
    await redeemReward(prisma, buyer.user.id, { rewardId: reward.id });
    await api().delete(`/api/v1/admin/rewards/${reward.id}`).set(headers);

    const wallet = await api()
      .get("/api/v1/loyalty/redemptions?status=AVAILABLE")
      .set(buyer.headers);
    expect(wallet.body.data).toHaveLength(1);
    const list = await api().get("/api/v1/admin/loyalty/redemptions").set(headers);
    expect(list.body.data[0]).toMatchObject({
      rewardName: "Bebida gratis",
      pointsSpent: 100,
      status: "AVAILABLE",
      customer: { email: buyer.user.email },
    });
    expect(
      (await api().get("/api/v1/admin/loyalty/redemptions?status=USED").set(headers)).body.data,
    ).toHaveLength(0);
    expect(
      (await api().get("/api/v1/admin/loyalty/redemptions?status=otro").set(headers)).status,
    ).toBe(400);
  });
});

describe("movements, customers and adjustments", () => {
  it("lists the ledger with filters and pagination", async () => {
    const { headers } = await withRole("ADMIN");
    const staff = await withRole("STAFF");
    const ana = await customer({ fullName: "Ana López" });
    const luis = await customer({ fullName: "Luis Pérez" });
    for (const [who, points] of [
      [ana, 50],
      [ana, 20],
      [luis, 30],
    ] as const) {
      await adjustPoints(prisma, {
        userId: who.user.id,
        actorId: staff.user.id,
        points,
        reason: "Prueba",
      });
    }

    const all = await api().get("/api/v1/admin/loyalty/transactions").set(headers);
    expect(all.body.meta.total).toBe(3);
    expect(all.body.data[0]).toMatchObject({
      type: "ADJUSTMENT",
      reason: "Prueba",
      createdBy: expect.any(String),
      customer: { id: luis.user.id },
    });
    expect(
      (await api().get(`/api/v1/admin/loyalty/transactions?userId=${ana.user.id}`).set(headers))
        .body.data,
    ).toHaveLength(2);
    expect(
      (await api().get("/api/v1/admin/loyalty/transactions?q=LUIS").set(headers)).body.data,
    ).toHaveLength(1);
    expect(
      (await api().get("/api/v1/admin/loyalty/transactions?type=EARN").set(headers)).body.data,
    ).toHaveLength(0);
    const page = await api()
      .get("/api/v1/admin/loyalty/transactions?pageSize=2&page=2")
      .set(headers);
    expect(page.body.data).toHaveLength(1);
    expect(page.body.meta).toMatchObject({ total: 3, totalPages: 2 });
    expect(
      (await api().get("/api/v1/admin/loyalty/transactions?type=NOPE").set(headers)).status,
    ).toBe(400);
  });

  it("finds customers with their balance", async () => {
    const staff = await withRole("STAFF");
    const ana = await customer({ fullName: "Ana López", username: "ana_l" });
    await adjustPoints(prisma, {
      userId: ana.user.id,
      actorId: staff.user.id,
      points: 70,
      reason: "Alta",
    });
    await customer({ fullName: "Luis Pérez", username: "luis_p" });

    const found = await api().get("/api/v1/admin/customers?q=ana").set(staff.headers);
    expect(found.body.data).toHaveLength(1);
    expect(found.body.data[0]).toMatchObject({
      fullName: "Ana López",
      username: "ana_l",
      balance: 70,
      lifetimeEarned: 0,
      orders: 0,
    });
    expect(
      (await api().get("/api/v1/admin/customers").set(staff.headers)).body.meta.total,
    ).toBeGreaterThanOrEqual(3);
  });

  it("adjusts points with a reason, audits it and never allows a negative balance", async () => {
    const { user, headers } = await withRole("ADMIN");
    const buyer = await customer();
    const post = (body: object) =>
      api().post("/api/v1/admin/loyalty/adjustments").set(headers).send(body);

    const gift = await post({
      userId: buyer.user.id,
      points: 120,
      reason: "Compensación por retraso",
    });
    expect(gift.status).toBe(201);
    expect(gift.body.data).toMatchObject({
      points: 120,
      balanceAfter: 120,
      balance: 120,
      reason: "Compensación por retraso",
    });
    expect((await api().get("/api/v1/loyalty/account").set(buyer.headers)).body.data.balance).toBe(
      120,
    );
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "loyalty.adjust" } });
    expect(audit).toMatchObject({ actorId: user.id, reason: "Compensación por retraso" });

    const take = await post({ userId: buyer.user.id, points: -50, reason: "Corrección de error" });
    expect(take.body.data.balance).toBe(70);
    const tooMuch = await post({ userId: buyer.user.id, points: -100, reason: "Demasiado" });
    expect(tooMuch.status).toBe(409);
    expect(tooMuch.body.error.code).toBe("INSUFFICIENT_POINTS");

    for (const body of [
      { userId: buyer.user.id, points: 10 },
      { userId: buyer.user.id, points: 10, reason: "ab" },
      { userId: buyer.user.id, points: 0, reason: "Nada" },
      { userId: buyer.user.id, points: 1.5, reason: "Medio" },
      { userId: "no-uuid", points: 1, reason: "Mal id" },
      { userId: buyer.user.id, points: 1, reason: "Bien", extra: 1 },
    ]) {
      expect((await post(body)).status, JSON.stringify(body)).toBe(400);
    }
    expect((await post({ userId: randomUUID(), points: 5, reason: "No existe" })).status).toBe(404);
  });
});
