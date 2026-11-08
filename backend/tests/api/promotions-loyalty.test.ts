import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { seedDemoData } from "../../prisma/seed-demo-data.js";
import { Redemption, data, paged } from "../../src/docs/schemas.js";
import { adjustPoints } from "../../src/modules/loyalty/ledger.service.js";
import { changeOrderStatus } from "../../src/modules/orders/status.service.js";
import { createTestClient, createUser, resetDatabase, type PrismaClient } from "../db/helpers.js";
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

async function line(slug: string, quantity = 1) {
  const product = await prisma.product.findFirstOrThrow({
    where: { slug },
    include: { optionGroups: { include: { options: true } } },
  });
  const optionIds = product.optionGroups
    .filter((group) => group.required)
    .flatMap((group) =>
      group.options.filter((option) => option.isDefault).map((option) => option.id),
    );
  return { productId: product.id, quantity, optionIds };
}

const customer = () => ctx.userWithToken({ username: "cliente1", phone: "+34 600 000 000" });

function placeOrder(headers: Record<string, string>, body: object, key = randomUUID()) {
  return api()
    .post("/api/v1/orders")
    .set(headers)
    .set("Idempotency-Key", key)
    .send({ type: "PICKUP", paymentMethod: "CASH_PICKUP", ...body });
}

function quote(headers: Record<string, string> | null, body: object) {
  const req = api().post("/api/v1/checkout/quote");
  if (headers) req.set(headers);
  return req.send({ type: "PICKUP", ...body });
}

const staffOf = () => createUser(prisma);

/** Crea una promoción con su cupón. */
async function makeCoupon(
  code: string,
  promotion: Partial<Parameters<typeof prisma.promotion.create>[0]["data"]> = {},
  coupon: Partial<Parameters<typeof prisma.coupon.create>[0]["data"]> = {},
) {
  const created = await prisma.promotion.create({
    data: {
      name: `Promo ${code}`,
      description: "Promoción de prueba",
      kind: "DISCOUNT",
      discountType: "PERCENT",
      discountValue: "10.00",
      ...promotion,
    } as never,
  });
  return prisma.coupon.create({
    data: { code, promotionId: created.id, ...coupon } as never,
  });
}

describe("coupons in the quote", () => {
  it("applies the welcome coupon on the server (10 % of the products)", async () => {
    const { headers } = await customer();
    const response = await quote(headers, {
      items: [await line("margherita", 2)],
      couponCode: "bienvenido10",
    });
    expect(response.status).toBe(200);
    expect(response.body.data.discounts).toEqual([
      { description: "10 % en tu primer pedido (BIENVENIDO10)", amount: "1.90" },
    ]);
    expect(response.body.data.totals).toMatchObject({
      subtotal: "19.00",
      discount: "1.90",
      total: "17.10",
      tax: "1.55",
    });
    // Los puntos se estiman sobre lo que se paga en productos: 17,10 -> 17.
    expect(response.body.data.pointsToEarn).toBe(17);
  });

  it("requires a session to use a coupon or a reward, but not for a plain quote", async () => {
    const items = [await line("margherita", 2)];
    expect((await quote(null, { items })).status).toBe(200);
    const anonymous = await quote(null, { items, couponCode: "BIENVENIDO10" });
    expect(anonymous.status).toBe(401);
    const forged = await quote({ Authorization: "Bearer nope" }, { items });
    expect(forged.status).toBe(401);
  });

  it("explains why a coupon cannot be used", async () => {
    const { headers } = await customer();
    const items = [await line("margherita", 2)];
    const code = async (couponCode: string) =>
      (await quote(headers, { items, couponCode })).body.error;

    expect(await code("NOEXISTE")).toMatchObject({ code: "COUPON_NOT_FOUND" });
    expect(await code("no valido!!")).toMatchObject({ code: "COUPON_NOT_FOUND" });

    await makeCoupon("EXPIRADO", { endsAt: new Date(Date.now() - 1000) });
    await makeCoupon("FUTURO", { startsAt: new Date(Date.now() + 86_400_000) });
    await makeCoupon("APAGADO", {}, { active: false });
    await makeCoupon("MINIMO50", { minSubtotal: "50.00" });
    expect(await code("EXPIRADO")).toMatchObject({ code: "COUPON_EXPIRED" });
    expect(await code("FUTURO")).toMatchObject({ code: "COUPON_NOT_STARTED" });
    expect(await code("APAGADO")).toMatchObject({ code: "COUPON_INACTIVE" });
    expect(await code("MINIMO50")).toMatchObject({
      code: "COUPON_MIN_SUBTOTAL",
      details: { minSubtotal: "50.00" },
    });
  });

  it("hides personal coupons that belong to someone else", async () => {
    const owner = await customer();
    const other = await customer();
    await makeCoupon("SOLOPARAMI", {}, { userId: owner.user.id });
    const items = [await line("margherita", 2)];
    expect((await quote(owner.headers, { items, couponCode: "SOLOPARAMI" })).status).toBe(200);
    const stranger = await quote(other.headers, { items, couponCode: "SOLOPARAMI" });
    expect(stranger.body.error.code).toBe("COUPON_NOT_FOUND");
  });

  it("limits a product-restricted discount to those products and handles fixed amounts", async () => {
    const { headers } = await customer();
    const drink = await prisma.product.findFirstOrThrow({ where: { slug: "agua" } });
    await makeCoupon("SOLOBEBIDAS", {
      discountType: "FIXED",
      discountValue: "5.00",
      products: { create: [{ productId: drink.id }] },
    });
    const onlyPizza = await quote(headers, {
      items: [await line("margherita", 2)],
      couponCode: "SOLOBEBIDAS",
    });
    expect(onlyPizza.body.error.code).toBe("COUPON_NOT_APPLICABLE");

    const withDrink = await quote(headers, {
      items: [await line("margherita"), await line("agua")],
      couponCode: "SOLOBEBIDAS",
    });
    // La bebida cuesta 2,00: el descuento fijo de 5,00 nunca supera la base a la que se aplica.
    expect(withDrink.body.data.discounts[0].amount).toBe("2.00");
  });

  it("applies a combo price when the order contains the combo products", async () => {
    const { headers } = await customer();
    const pizza = await prisma.product.findFirstOrThrow({ where: { slug: "margherita" } });
    const drink = await prisma.product.findFirstOrThrow({ where: { slug: "agua" } });
    await makeCoupon("COMBO1", {
      kind: "COMBO",
      discountType: null,
      discountValue: null,
      comboPrice: "10.50",
      products: { create: [{ productId: pizza.id }, { productId: drink.id }] },
    });
    const missing = await quote(headers, {
      items: [await line("margherita")],
      couponCode: "COMBO1",
    });
    expect(missing.body.error.code).toBe("COUPON_NOT_APPLICABLE");
    const ok = await quote(headers, {
      items: [await line("margherita"), await line("agua")],
      couponCode: "COMBO1",
    });
    // 9,50 + 2,00 = 11,50 -> combo 10,50: descuento de 1,00.
    expect(ok.body.data.discounts[0].amount).toBe("1.00");
    expect(ok.body.data.totals.total).toBe("10.50");
  });

  it("never lets the client send a discount amount", async () => {
    const { headers } = await customer();
    for (const extra of [{ discount: "5.00" }, { discountTotal: "5.00" }, { total: "1.00" }]) {
      const response = await quote(headers, { items: [await line("margherita")], ...extra });
      expect(response.status).toBe(400);
    }
  });
});

describe("orders with a coupon", () => {
  it("records the discount, the coupon use and the VAT of what is paid", async () => {
    const { user, headers } = await customer();
    const response = await placeOrder(headers, {
      items: [await line("margherita", 2)],
      couponCode: "bienvenido10",
    });
    expect(response.status).toBe(201);
    expect(response.body.data.discounts).toEqual([
      { description: "10 % en tu primer pedido (BIENVENIDO10)", amount: "1.90" },
    ]);
    expect(response.body.data.totals).toMatchObject({
      discount: "1.90",
      total: "17.10",
      tax: "1.55",
    });

    const stored = await prisma.order.findUniqueOrThrow({
      where: { id: response.body.data.id },
      include: { discounts: true, couponRedemption: true },
    });
    expect(stored.couponCode).toBe("BIENVENIDO10");
    expect(stored.couponRedemption?.userId).toBe(user.id);
    expect(stored.discounts[0]).toMatchObject({ amount: expect.anything() });
  });

  it("allows the welcome coupon only on the first order, and frees it when that order is cancelled", async () => {
    const { headers } = await customer();
    const items = [await line("margherita", 2)];
    const first = await placeOrder(headers, { items, couponCode: "BIENVENIDO10" });
    expect(first.status).toBe(201);

    const second = await placeOrder(headers, { items, couponCode: "BIENVENIDO10" });
    expect(second.status).toBe(422);
    expect(["COUPON_NOT_FIRST_ORDER", "COUPON_ALREADY_USED"]).toContain(second.body.error.code);

    // El cliente cancela el primero: su cupón vuelve a estar libre.
    expect(
      (await api().post(`/api/v1/orders/${first.body.data.id}/cancel`).set(headers)).status,
    ).toBe(200);
    const third = await placeOrder(headers, { items, couponCode: "BIENVENIDO10" });
    expect(third.status).toBe(201);
  });

  it("respects the total uses of a coupon across customers", async () => {
    await makeCoupon("UNAVEZ", {}, { maxRedemptions: 1 });
    const one = await customer();
    const two = await customer();
    const items = [await line("margherita", 2)];
    expect((await placeOrder(one.headers, { items, couponCode: "UNAVEZ" })).status).toBe(201);
    const second = await placeOrder(two.headers, { items, couponCode: "UNAVEZ" });
    expect(second.body.error.code).toBe("COUPON_USED_UP");
  });

  it("a single-use coupon cannot be spent twice by simultaneous orders", async () => {
    await makeCoupon("CARRERA", {}, { maxRedemptions: 1 });
    const users = await Promise.all([customer(), customer(), customer(), customer()]);
    const items = [await line("margherita", 2)];
    const results = await Promise.all(
      users.map((current) => placeOrder(current.headers, { items, couponCode: "CARRERA" })),
    );
    expect(results.filter((result) => result.status === 201)).toHaveLength(1);
    for (const failed of results.filter((result) => result.status !== 201)) {
      expect(failed.body.error.code).toBe("COUPON_USED_UP");
    }
    expect(await prisma.couponRedemption.count()).toBe(1);
  });

  it("does not grant points for the discount, and takes the coupon use back on cancellation", async () => {
    const { user, headers } = await customer();
    const staff = await staffOf();
    const created = await placeOrder(headers, {
      items: [await line("margherita", 2)],
      couponCode: "BIENVENIDO10",
    });
    const orderId = created.body.data.id as string;
    for (const to of ["ACCEPTED", "PREPARING", "READY", "COMPLETED"] as const) {
      await changeOrderStatus(prisma, { orderId, to, actorId: staff.id });
    }
    const account = await api().get("/api/v1/loyalty/account").set(headers);
    expect(account.body.data.balance).toBe(17); // 19,00 - 1,90 = 17,10 -> 17 puntos
    const transactions = await api().get("/api/v1/loyalty/transactions").set(headers);
    expect(transactions.body.data[0]).toMatchObject({
      type: "EARN",
      points: 17,
      orderNumber: created.body.data.orderNumber,
    });

    await changeOrderStatus(prisma, {
      orderId,
      to: "CANCELLED",
      actorId: staff.id,
      reason: "Devolución",
    });
    expect((await api().get("/api/v1/loyalty/account").set(headers)).body.data.balance).toBe(0);
    expect(user.id).toBeTruthy();
  });
});

describe("FORNO CLUB rewards", () => {
  async function withPoints(points: number) {
    const current = await customer();
    const staff = await staffOf();
    if (points > 0)
      await adjustPoints(prisma, {
        userId: current.user.id,
        actorId: staff.id,
        points,
        reason: "Saldo de prueba",
      });
    return { ...current, staff };
  }
  const reward = (cost: number) => prisma.reward.findFirstOrThrow({ where: { pointsCost: cost } });
  const redeem = (headers: Record<string, string>, rewardId: string, key = randomUUID()) =>
    api()
      .post("/api/v1/loyalty/redemptions")
      .set(headers)
      .set("Idempotency-Key", key)
      .send({ rewardId });

  it("publishes the program (conversion rule and rewards) without a session", async () => {
    const response = await api().get("/api/v1/loyalty/program");
    expect(response.status).toBe(200);
    expect(response.body.data.pointsPerEuro).toBe("1");
    expect(response.body.data.rewards).toHaveLength(3);
    expect(response.body.data.rewards[0]).toMatchObject({
      pointsCost: 100,
      benefit: { type: "FREE_PRODUCT", productName: "Agua mineral" },
      inStock: true,
    });
  });

  it("redeems a reward once per Idempotency-Key and lists it in the wallet", async () => {
    const { headers } = await withPoints(130);
    const target = await reward(100);
    const key = randomUUID();
    const first = await redeem(headers, target.id, key);
    expect(first.status).toBe(201);
    data(Redemption).parse(first.body);
    expect(first.body.data).toMatchObject({
      status: "AVAILABLE",
      pointsSpent: 100,
      rewardName: "Bebida gratis",
    });

    const again = await redeem(headers, target.id, key);
    expect(again.status).toBe(201);
    expect(again.body.data.id).toBe(first.body.data.id);
    expect(again.headers["idempotent-replayed"]).toBe("true");
    expect((await api().get("/api/v1/loyalty/account").set(headers)).body.data.balance).toBe(30);

    const wallet = await api().get("/api/v1/loyalty/redemptions?status=AVAILABLE").set(headers);
    paged(Redemption).parse(wallet.body);
    expect(wallet.body.data).toHaveLength(1);
    expect(wallet.body.data[0].benefit).toMatchObject({
      type: "FREE_PRODUCT",
      productName: "Agua mineral",
    });
  });

  it("requires the key and enough points", async () => {
    const { headers } = await withPoints(50);
    const target = await reward(100);
    const noKey = await api()
      .post("/api/v1/loyalty/redemptions")
      .set(headers)
      .send({ rewardId: target.id });
    expect(noKey.status).toBe(400);
    const poor = await redeem(headers, target.id);
    expect(poor.status).toBe(409);
    expect(poor.body.error.code).toBe("INSUFFICIENT_POINTS");
    expect((await redeem(headers, randomUUID())).status).toBe(404);
    expect((await api().post("/api/v1/loyalty/redemptions").send({})).status).toBe(401);
  });

  it("does not let simultaneous requests spend the same points", async () => {
    const { headers } = await withPoints(100);
    const target = await reward(100);
    const results = await Promise.all(Array.from({ length: 5 }, () => redeem(headers, target.id)));
    expect(results.filter((result) => result.status === 201)).toHaveLength(1);
    expect((await api().get("/api/v1/loyalty/account").set(headers)).body.data.balance).toBe(0);
    expect(await prisma.rewardRedemption.count()).toBe(1);
  });

  it("uses a free-product reward in an order, once, and only the owner's", async () => {
    const { headers } = await withPoints(100);
    const other = await customer();
    const redemption = (await redeem(headers, (await reward(100)).id)).body.data;
    const items = [await line("margherita", 2), await line("agua")];

    // Sin el producto de la recompensa en el pedido, no se puede aplicar.
    const missing = await quote(headers, {
      items: [await line("margherita", 2)],
      redemptionId: redemption.id,
    });
    expect(missing.body.error.code).toBe("REWARD_NOT_APPLICABLE");
    // Otro cliente no puede usar la recompensa.
    const stolen = await quote(other.headers, { items, redemptionId: redemption.id });
    expect(stolen.body.error.code).toBe("REDEMPTION_NOT_AVAILABLE");

    const preview = await quote(headers, { items, redemptionId: redemption.id });
    expect(preview.body.data.discounts[0]).toMatchObject({
      description: "Recompensa: Bebida gratis",
      amount: "2.00",
    });

    const created = await placeOrder(headers, { items, redemptionId: redemption.id });
    expect(created.status).toBe(201);
    expect(created.body.data.totals).toMatchObject({
      subtotal: "21.00",
      discount: "2.00",
      total: "19.00",
    });
    const stored = await prisma.rewardRedemption.findUniqueOrThrow({
      where: { id: redemption.id },
    });
    expect(stored).toMatchObject({ status: "USED", orderId: created.body.data.id });

    const reuse = await placeOrder(headers, { items, redemptionId: redemption.id });
    expect(reuse.body.error.code).toBe("REDEMPTION_NOT_AVAILABLE");
  });

  it("applies a fixed-amount reward without exceeding the order and refunds the points on cancellation", async () => {
    const { headers } = await withPoints(150);
    const fixed = await prisma.reward.create({
      data: { name: "5 euros de descuento", pointsCost: 120, discountAmount: "5.00" },
    });
    const redemption = (await redeem(headers, fixed.id)).body.data;
    expect((await api().get("/api/v1/loyalty/account").set(headers)).body.data.balance).toBe(30);

    const created = await placeOrder(headers, {
      items: [await line("margherita", 2)],
      redemptionId: redemption.id,
    });
    expect(created.status).toBe(201);
    expect(created.body.data.totals).toMatchObject({ discount: "5.00", total: "14.00" });

    // El cliente cancela antes de que el local acepte: recupera todos los puntos.
    const cancelled = await api()
      .post(`/api/v1/orders/${created.body.data.id}/cancel`)
      .set(headers);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe("CANCELLED");
    expect((await api().get("/api/v1/loyalty/account").set(headers)).body.data.balance).toBe(150);
    const wallet = await api().get("/api/v1/loyalty/redemptions").set(headers);
    expect(wallet.body.data[0].status).toBe("CANCELLED");
  });

  it("two orders cannot use the same reward at the same time", async () => {
    const { headers } = await withPoints(100);
    const redemption = (await redeem(headers, (await reward(100)).id)).body.data;
    const items = [await line("margherita", 2), await line("agua")];
    const results = await Promise.all(
      Array.from({ length: 4 }, () => placeOrder(headers, { items, redemptionId: redemption.id })),
    );
    expect(results.filter((result) => result.status === 201)).toHaveLength(1);
    expect(await prisma.order.count()).toBe(1);
  });
});

describe("customer cancellation", () => {
  it("cancels only the customer's own order before it is accepted", async () => {
    const { headers } = await customer();
    const other = await customer();
    const staff = await staffOf();
    const created = await placeOrder(headers, { items: [await line("margherita")] });
    const id = created.body.data.id as string;

    expect((await api().post(`/api/v1/orders/${id}/cancel`).set(other.headers)).status).toBe(404);
    expect((await api().post(`/api/v1/orders/${id}/cancel`)).status).toBe(401);

    await changeOrderStatus(prisma, { orderId: id, to: "ACCEPTED", actorId: staff.id });
    const late = await api().post(`/api/v1/orders/${id}/cancel`).set(headers);
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe("CANNOT_CANCEL");

    const fresh = await placeOrder(headers, { items: [await line("margherita")] });
    const ok = await api().post(`/api/v1/orders/${fresh.body.data.id}/cancel`).set(headers);
    expect(ok.body.data).toMatchObject({ status: "CANCELLED" });
    expect(ok.body.data.payments[0].status).toBe("CANCELLED");
    expect(ok.body.data.history.map((entry: { status: string }) => entry.status)).toEqual([
      "NEW",
      "CANCELLED",
    ]);
  });
});
