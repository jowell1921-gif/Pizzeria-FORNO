import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { seedDemoData } from "../../prisma/seed-demo-data.js";
import {
  AdminAllergen,
  AdminCategory,
  AdminProduct,
  AdminRedemption,
  AdminReward,
  AdminStoreSettings,
  AdminTransaction,
  AdminZone,
  AdminPromotion,
  AuditEntry,
  Customer,
  LoyaltySettings,
  OpeningSlot,
  PointsAdjustment,
  SpecialDay,
} from "../../src/docs/schemas-admin.js";
import { data, paged } from "../../src/docs/schemas.js";
import { adjustPoints, redeemReward } from "../../src/modules/loyalty/ledger.service.js";
import { createTestClient, resetDatabase, type PrismaClient } from "../db/helpers.js";
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

/** Lo que responde el servidor coincide con el contrato que documenta OpenAPI. */
describe("administration responses match the documented contract", () => {
  it("covers the menu, the store, promotions, FORNO CLUB and the audit log", async () => {
    const admin = await ctx.userWithToken({ username: "admin_1", phone: "+34 600 000 001" });
    await prisma.userRole.create({ data: { userId: admin.user.id, role: "ADMIN" } });
    const buyer = await ctx.userWithToken({ username: "cliente1", phone: "+34 600 000 002" });
    await adjustPoints(prisma, {
      userId: buyer.user.id,
      actorId: admin.user.id,
      points: 150,
      reason: "Alta",
    });
    await redeemReward(prisma, buyer.user.id, {
      rewardId: (await prisma.reward.findFirstOrThrow({ where: { pointsCost: 100 } })).id,
    });
    await request(ctx.app)
      .post("/api/v1/admin/categories")
      .set(admin.headers)
      .send({ name: "Ensaladas" });
    const get = async (path: string) =>
      (await request(ctx.app).get(`/api/v1/admin${path}`).set(admin.headers)).body;

    data(AdminCategory.array()).parse(await get("/categories"));
    data(AdminAllergen.array()).parse(await get("/allergens"));
    const products = data(AdminProduct.array()).parse(await get("/products")).data;
    expect(products).toHaveLength(15);
    data(AdminProduct).parse(await get(`/products/${products[0]!.id}`));
    data(AdminStoreSettings).parse(await get("/store/settings"));
    data(OpeningSlot.array()).parse(await get("/store/opening-hours"));
    await request(ctx.app)
      .post("/api/v1/admin/store/special-days")
      .set(admin.headers)
      .send({ date: "2099-12-25", closed: true });
    data(SpecialDay.array()).parse(await get("/store/special-days"));
    data(AdminZone.array()).parse(await get("/delivery-zones"));
    const promotions = data(AdminPromotion.array()).parse(await get("/promotions")).data;
    data(AdminPromotion).parse(await get(`/promotions/${promotions[0]!.id}`));
    data(LoyaltySettings).parse(await get("/loyalty/settings"));
    data(AdminReward.array()).parse(await get("/rewards"));
    paged(AdminTransaction).parse(await get("/loyalty/transactions"));
    paged(AdminRedemption).parse(await get("/loyalty/redemptions"));
    paged(Customer).parse(await get("/customers"));
    paged(AuditEntry).parse(await get("/audit"));

    const adjustment = await request(ctx.app)
      .post("/api/v1/admin/loyalty/adjustments")
      .set(admin.headers)
      .send({ userId: buyer.user.id, points: 5, reason: "Prueba de contrato" });
    data(PointsAdjustment).parse(adjustment.body);
  });
});
