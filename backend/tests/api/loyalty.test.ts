import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { seedDemoData } from "../../prisma/seed-demo-data.js";
import {
  createLoyaltyAccount,
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
});

/** Concede puntos por un pedido (como lo hará el servicio de la Fase 7). */
async function grantPoints(userId: string, points: number) {
  const account =
    (await prisma.loyaltyAccount.findUnique({ where: { userId } })) ??
    (await createLoyaltyAccount(prisma, userId));
  const product = await createProduct(prisma);
  const order = await createOrder(prisma, { userId, productId: product.id });
  await prisma.loyaltyTransaction.create({
    data: { accountId: account.id, type: "EARN", points, orderId: order.id },
  });
  return order;
}

describe("GET /api/v1/loyalty/account", () => {
  it("requires authentication", async () => {
    expect((await request(ctx.app).get("/api/v1/loyalty/account")).status).toBe(401);
    expect((await request(ctx.app).get("/api/v1/loyalty/transactions")).status).toBe(401);
    expect((await request(ctx.app).get("/api/v1/loyalty/rewards")).status).toBe(401);
  });

  it("shows zero points for a new user, and creates the account for older profiles", async () => {
    const { headers, user } = await ctx.userWithToken();
    expect(await prisma.loyaltyAccount.count({ where: { userId: user.id } })).toBe(0);

    const response = await request(ctx.app).get("/api/v1/loyalty/account").set(headers);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ balance: 0, lifetimeEarned: 0, nextReward: null });
    expect(await prisma.loyaltyAccount.count({ where: { userId: user.id } })).toBe(1);
  });

  it("reports the balance of the ledger and the progress to the next reward", async () => {
    await seedDemoData(prisma); // recompensas de 100, 250 y 400 puntos
    const { headers, user } = await ctx.userWithToken();
    await grantPoints(user.id, 130);

    const response = await request(ctx.app).get("/api/v1/loyalty/account").set(headers);
    expect(response.body.data).toMatchObject({
      balance: 130,
      lifetimeEarned: 130,
      pointsPerEuro: "1",
      availableRewards: 1,
    });
    // Ya alcanzó la de 100: el progreso va de 100 a 250 (30 de 150 = 0,2).
    expect(response.body.data.nextReward).toMatchObject({
      name: "Entrante a elegir",
      pointsCost: 250,
      pointsMissing: 120,
    });
    expect(response.body.data.nextReward.progress).toBeCloseTo(0.2, 5);
  });

  it("shows progress from zero before the first reward, and no next reward when all are reached", async () => {
    await seedDemoData(prisma);
    const first = await ctx.userWithToken();
    await grantPoints(first.user.id, 25);
    const early = await request(ctx.app).get("/api/v1/loyalty/account").set(first.headers);
    expect(early.body.data.nextReward).toMatchObject({ name: "Bebida gratis", pointsMissing: 75 });
    expect(early.body.data.nextReward.progress).toBeCloseTo(0.25, 5);

    const rich = await ctx.userWithToken();
    await grantPoints(rich.user.id, 500);
    const late = await request(ctx.app).get("/api/v1/loyalty/account").set(rich.headers);
    expect(late.body.data.nextReward).toBeNull();
    expect(late.body.data.availableRewards).toBe(3);
  });

  it("only ever shows the points of the signed-in user", async () => {
    const ana = await ctx.userWithToken();
    const luis = await ctx.userWithToken();
    await grantPoints(ana.user.id, 300);
    await grantPoints(luis.user.id, 40);

    const anaView = await request(ctx.app).get("/api/v1/loyalty/account").set(ana.headers);
    const luisView = await request(ctx.app).get("/api/v1/loyalty/account").set(luis.headers);
    expect(anaView.body.data.balance).toBe(300);
    expect(luisView.body.data.balance).toBe(40);
  });
});

describe("GET /api/v1/loyalty/transactions", () => {
  it("lists the own movements, newest first, with pagination", async () => {
    const { headers, user } = await ctx.userWithToken();
    for (const points of [10, 20, 30]) await grantPoints(user.id, points);

    const first = await request(ctx.app)
      .get("/api/v1/loyalty/transactions")
      .query({ page: 1, pageSize: 2 })
      .set(headers);
    expect(first.status).toBe(200);
    expect(first.body.meta).toEqual({ page: 1, pageSize: 2, total: 3, totalPages: 2 });
    expect(first.body.data.map((row: { points: number }) => row.points)).toEqual([30, 20]);
    expect(first.body.data[0]).toMatchObject({ type: "EARN", balanceAfter: 60 });
    expect(first.body.data[0].orderNumber).toEqual(expect.any(Number));

    const second = await request(ctx.app)
      .get("/api/v1/loyalty/transactions")
      .query({ page: 2, pageSize: 2 })
      .set(headers);
    expect(second.body.data.map((row: { points: number }) => row.points)).toEqual([10]);
  });

  it("never includes another user's movements and hides internal fields", async () => {
    const ana = await ctx.userWithToken();
    const luis = await ctx.userWithToken();
    await grantPoints(ana.user.id, 300);

    const response = await request(ctx.app).get("/api/v1/loyalty/transactions").set(luis.headers);
    expect(response.body.data).toEqual([]);

    const own = await request(ctx.app).get("/api/v1/loyalty/transactions").set(ana.headers);
    expect(Object.keys(own.body.data[0]).sort()).toEqual(
      ["balanceAfter", "createdAt", "id", "orderNumber", "points", "reason", "type"].sort(),
    );
  });

  it("validates the pagination parameters", async () => {
    const { headers } = await ctx.userWithToken();
    for (const query of [{ page: 0 }, { page: "x" }, { pageSize: 0 }, { pageSize: 500 }]) {
      const response = await request(ctx.app)
        .get("/api/v1/loyalty/transactions")
        .query(query)
        .set(headers);
      expect(response.status, JSON.stringify(query)).toBe(400);
    }
  });
});

describe("GET /api/v1/loyalty/rewards", () => {
  it("lists active rewards in ascending cost, without deleted, inactive or expired ones", async () => {
    const { headers } = await ctx.userWithToken();
    const product = await createProduct(prisma);
    const base = { freeProductId: product.id };
    await prisma.reward.createMany({
      data: [
        { ...base, name: "Cara", pointsCost: 300 },
        { ...base, name: "Barata", pointsCost: 50 },
        { ...base, name: "Inactiva", pointsCost: 10, active: false },
        { ...base, name: "Borrada", pointsCost: 20, deletedAt: new Date() },
        { ...base, name: "Caducada", pointsCost: 30, validTo: new Date(Date.now() - 86_400_000) },
        { ...base, name: "Futura", pointsCost: 40, validFrom: new Date(Date.now() + 86_400_000) },
      ],
    });

    const response = await request(ctx.app).get("/api/v1/loyalty/rewards").set(headers);
    expect(response.body.data.map((reward: { name: string }) => reward.name)).toEqual([
      "Barata",
      "Cara",
    ]);
  });
});
