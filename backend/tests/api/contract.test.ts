import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../../src/app.js";
import {
  Address,
  ErrorResponse,
  LoyaltyAccount,
  LoyaltyTransaction,
  Order,
  OrderSummary,
  Profile,
  Reward,
  data,
  paged,
} from "../../src/docs/schemas.js";
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
  await seedDemoData(prisma);
});

/**
 * Contrato: lo que responde el servidor coincide con los esquemas que generan la documentación
 * OpenAPI. Si una respuesta cambia sin actualizar el contrato, estas pruebas fallan.
 */
describe("authenticated responses match the documented contract", () => {
  it("covers profile, addresses, loyalty and orders", async () => {
    const { user, headers } = await ctx.userWithToken();
    const account = await createLoyaltyAccount(prisma, user.id);
    const product = await createProduct(prisma);
    const order = await createOrder(prisma, { userId: user.id, productId: product.id });
    await prisma.loyaltyTransaction.create({
      data: { accountId: account.id, type: "EARN", points: 40, orderId: order.id },
    });
    const api = request(ctx.app);

    const profile = await api.get("/api/v1/me").set(headers);
    data(Profile).parse(profile.body);

    const patched = await api
      .patch("/api/v1/me")
      .set(headers)
      .send({ username: "ana_l", phone: "+34 600 000 000" });
    expect(data(Profile).parse(patched.body).data.profileComplete).toBe(true);

    const created = await api.post("/api/v1/me/addresses").set(headers).send({
      recipientName: "Ana",
      line1: "Calle Mayor 1",
      postalCode: "28001",
      city: "Madrid",
    });
    expect(created.status).toBe(201);
    Address.parse(created.body.data);
    data(Address.array()).parse(
      await api
        .get("/api/v1/me/addresses")
        .set(headers)
        .then((r) => r.body),
    );

    data(LoyaltyAccount).parse((await api.get("/api/v1/loyalty/account").set(headers)).body);
    paged(LoyaltyTransaction).parse(
      (await api.get("/api/v1/loyalty/transactions").set(headers)).body,
    );
    data(Reward.array()).parse((await api.get("/api/v1/loyalty/rewards").set(headers)).body);

    paged(OrderSummary).parse((await api.get("/api/v1/orders/me").set(headers)).body);
    data(Order).parse((await api.get(`/api/v1/orders/${order.id}`).set(headers)).body);
  });

  it("answers errors in the documented format", async () => {
    const api = request(ctx.app);
    const unauthenticated = await api.get("/api/v1/me");
    ErrorResponse.parse(unauthenticated.body);
    expect(unauthenticated.status).toBe(401);

    const { headers } = await ctx.userWithToken();
    const invalid = await api.patch("/api/v1/me").set(headers).send({ role: "ADMIN" });
    expect(invalid.status).toBe(400);
    ErrorResponse.parse(invalid.body);
    expect(invalid.headers["x-request-id"]).toBe(invalid.body.error.requestId);
  });
});

describe("per-user rate limits", () => {
  it("limits write requests per user without affecting other users or reads", async () => {
    const auth = await createTestApp(prisma);
    const limited = createApp(
      {
        CORS_ORIGINS: [],
        rateLimits: { windowMs: 60_000, ipMax: 1000, userMax: 1000, userWriteMax: 2 },
      },
      { prisma, verifyToken: auth.auth.verifyToken },
    );
    const one = await auth.userWithToken();
    const two = await auth.userWithToken();
    const patch = (headers: Record<string, string>) =>
      request(limited).patch("/api/v1/me").set(headers).send({ marketingConsent: true });

    expect((await patch(one.headers)).status).toBe(200);
    expect((await patch(one.headers)).status).toBe(200);
    const blocked = await patch(one.headers);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("RATE_LIMITED");

    // Otro usuario no se ve afectado, y las lecturas del bloqueado siguen funcionando.
    expect((await patch(two.headers)).status).toBe(200);
    expect((await request(limited).get("/api/v1/me").set(one.headers)).status).toBe(200);
  });
});
