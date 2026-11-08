import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { seedDemoData } from "../../prisma/seed-demo-data.js";
import {
  adjustPoints,
  earnPointsForOrder,
  redeemReward,
} from "../../src/modules/loyalty/ledger.service.js";
import { cancelMyOrder, changeOrderStatus } from "../../src/modules/orders/status.service.js";
import {
  createLoyaltyAccount,
  createOrder,
  createProduct,
  createTestClient,
  createUser,
  resetDatabase,
  type PrismaClient,
} from "./helpers.js";

let prisma: PrismaClient;

beforeAll(() => {
  prisma = createTestClient();
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDatabase(prisma);
  await seedDemoData(prisma);
  await prisma.storeSettings.update({ where: { id: 1 }, data: { loyaltyPointsPerEuro: "1.0000" } });
});

async function setup(
  options: Parameters<typeof createOrder>[1] extends infer T ? Partial<T> : never = {},
) {
  const user = await createUser(prisma);
  const staff = await createUser(prisma);
  const product = await createProduct(prisma);
  const order = await createOrder(prisma, { userId: user.id, productId: product.id, ...options });
  return { user, staff, order };
}

/** Lleva un pedido de «nuevo» a «completado» por los estados normales. */
async function complete(orderId: string, actorId: string) {
  for (const to of ["ACCEPTED", "PREPARING", "READY", "COMPLETED"] as const) {
    await changeOrderStatus(prisma, { orderId, to, actorId });
  }
}

const balanceOf = async (userId: string) =>
  (await prisma.loyaltyAccount.findUniqueOrThrow({ where: { userId } })).balance;

describe("points are granted when an order is completed", () => {
  it("grants 1 point per euro of products (20 euros -> 20 points) and collects the cash", async () => {
    const { user, staff, order } = await setup(); // 2 x 10,00
    await prisma.payment.create({
      data: {
        orderId: order.id,
        method: "CASH_PICKUP",
        status: "CASH_PENDING",
        amount: order.total,
      },
    });
    await complete(order.id, staff.id);

    expect(await balanceOf(user.id)).toBe(20);
    const entry = await prisma.loyaltyTransaction.findFirstOrThrow({
      where: { orderId: order.id },
    });
    expect(entry).toMatchObject({ type: "EARN", points: 20, balanceAfter: 20 });
    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
    expect(payment.status).toBe("CASH_COLLECTED");
    expect(payment.paidAt).not.toBeNull();
  });

  it("does not grant points before completion", async () => {
    const { user, staff, order } = await setup();
    for (const to of ["ACCEPTED", "PREPARING", "READY"] as const) {
      await changeOrderStatus(prisma, { orderId: order.id, to, actorId: staff.id });
    }
    expect(await prisma.loyaltyTransaction.count()).toBe(0);
    expect(await prisma.loyaltyAccount.count({ where: { userId: user.id } })).toBe(0);
    await expect(earnPointsForOrder(prisma, order.id)).rejects.toMatchObject({
      code: "ORDER_NOT_COMPLETED",
    });
  });

  it("excludes the delivery fee and the discounts from the points", async () => {
    const delivery = await setup({ type: "DELIVERY", deliveryFee: "2.50" }); // 20,00 + envío
    await complete(delivery.order.id, delivery.staff.id);
    expect(await balanceOf(delivery.user.id)).toBe(20);

    const discounted = await setup({ discountTotal: "5.00" }); // 20,00 - 5,00
    await complete(discounted.order.id, discounted.staff.id);
    expect(await balanceOf(discounted.user.id)).toBe(15);
  });

  it("uses the configured conversion and rounds down", async () => {
    await prisma.storeSettings.update({
      where: { id: 1 },
      data: { loyaltyPointsPerEuro: "0.3333" },
    });
    const { user, staff, order } = await setup({ unitPrice: "9.50", quantity: 1 });
    await complete(order.id, staff.id);
    expect(await balanceOf(user.id)).toBe(3); // 9,50 x 0,3333 = 3,16 -> 3
  });

  it("never grants points twice for the same order", async () => {
    const { user, staff, order } = await setup();
    await complete(order.id, staff.id);

    // Repetir el cambio es un error; llamar al servicio de abono otra vez no suma nada.
    await expect(
      changeOrderStatus(prisma, { orderId: order.id, to: "COMPLETED", actorId: staff.id }),
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    const again = await prisma.$transaction((tx) => earnPointsForOrder(tx, order.id));
    expect(again.created).toBe(false);
    expect(await prisma.loyaltyTransaction.count({ where: { type: "EARN" } })).toBe(1);
    expect(await balanceOf(user.id)).toBe(20);
  });

  it("grants points once even when two staff members complete the order at the same time", async () => {
    const { user, staff, order } = await setup();
    for (const to of ["ACCEPTED", "PREPARING", "READY"] as const) {
      await changeOrderStatus(prisma, { orderId: order.id, to, actorId: staff.id });
    }
    const results = await Promise.allSettled([
      changeOrderStatus(prisma, { orderId: order.id, to: "COMPLETED", actorId: staff.id }),
      changeOrderStatus(prisma, { orderId: order.id, to: "COMPLETED", actorId: staff.id }),
      changeOrderStatus(prisma, { orderId: order.id, to: "COMPLETED", actorId: staff.id }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.loyaltyTransaction.count({ where: { type: "EARN" } })).toBe(1);
    expect(await balanceOf(user.id)).toBe(20);
  });
});

describe("order status rules", () => {
  it("rejects invalid transitions and keeps the history", async () => {
    const { staff, order } = await setup();
    const attempt = (to: Parameters<typeof changeOrderStatus>[1]["to"]) =>
      changeOrderStatus(prisma, { orderId: order.id, to, actorId: staff.id });

    await expect(attempt("COMPLETED")).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(attempt("READY")).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(attempt("OUT_FOR_DELIVERY")).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await attempt("ACCEPTED");
    await attempt("PREPARING");
    await attempt("READY");
    // Un pedido para recoger no sale a reparto.
    await expect(attempt("OUT_FOR_DELIVERY")).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await attempt("COMPLETED");

    const history = await prisma.orderStatusHistory.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: "asc" },
    });
    expect(history.map((entry) => entry.toStatus)).toEqual([
      "ACCEPTED",
      "PREPARING",
      "READY",
      "COMPLETED",
    ]);
    expect(history[0]).toMatchObject({ fromStatus: "NEW", changedById: staff.id });
  });

  it("lets a delivery order go out for delivery, and treats rejected orders as final", async () => {
    const delivery = await setup({ type: "DELIVERY" });
    for (const to of ["ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "COMPLETED"] as const) {
      await changeOrderStatus(prisma, {
        orderId: delivery.order.id,
        to,
        actorId: delivery.staff.id,
      });
    }
    const { staff, order } = await setup();
    await expect(
      changeOrderStatus(prisma, { orderId: order.id, to: "REJECTED", actorId: staff.id }),
    ).rejects.toMatchObject({ code: "REASON_REQUIRED" });
    await changeOrderStatus(prisma, {
      orderId: order.id,
      to: "REJECTED",
      actorId: staff.id,
      reason: "Sin stock",
    });
    await expect(
      changeOrderStatus(prisma, { orderId: order.id, to: "ACCEPTED", actorId: staff.id }),
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    const stored = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(stored).toMatchObject({ status: "REJECTED", cancellationReason: "Sin stock" });
    expect(stored.cancelledAt).not.toBeNull();
  });
});

describe("cancellations reverse the points", () => {
  it("takes back the points earned when a completed order is cancelled, and refunds the cash", async () => {
    const { user, staff, order } = await setup();
    await prisma.payment.create({
      data: {
        orderId: order.id,
        method: "CASH_PICKUP",
        status: "CASH_PENDING",
        amount: order.total,
      },
    });
    await complete(order.id, staff.id);
    expect(await balanceOf(user.id)).toBe(20);

    await expect(
      changeOrderStatus(prisma, { orderId: order.id, to: "CANCELLED", actorId: staff.id }),
    ).rejects.toMatchObject({ code: "REASON_REQUIRED" });
    await changeOrderStatus(prisma, {
      orderId: order.id,
      to: "CANCELLED",
      actorId: staff.id,
      reason: "Devolución del pedido",
    });

    expect(await balanceOf(user.id)).toBe(0);
    const reversal = await prisma.loyaltyTransaction.findFirstOrThrow({
      where: { orderId: order.id, type: "REVERSAL" },
    });
    expect(reversal.points).toBe(-20);
    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
    expect(payment).toMatchObject({ status: "REFUNDED" });
    expect(payment.refundedAmount.toFixed(2)).toBe("20.00");
  });

  it("reverses only the available balance and never leaves a negative balance", async () => {
    const { user, staff, order } = await setup();
    await complete(order.id, staff.id); // +20
    await adjustPoints(prisma, {
      userId: user.id,
      actorId: staff.id,
      points: 100,
      reason: "Regalo",
    });
    // El cliente gasta casi todo: quedan 20.
    await redeemReward(prisma, user.id, {
      rewardId: (await prisma.reward.findFirstOrThrow({ where: { pointsCost: 100 } })).id,
    });
    expect(await balanceOf(user.id)).toBe(20);
    await adjustPoints(prisma, {
      userId: user.id,
      actorId: staff.id,
      points: -15,
      reason: "Corrección",
    });
    expect(await balanceOf(user.id)).toBe(5);

    await changeOrderStatus(prisma, {
      orderId: order.id,
      to: "CANCELLED",
      actorId: staff.id,
      reason: "Devolución",
    });
    expect(await balanceOf(user.id)).toBe(0);
    const reversal = await prisma.loyaltyTransaction.findFirstOrThrow({
      where: { orderId: order.id, type: "REVERSAL" },
    });
    expect(reversal.points).toBe(-5);
  });

  it("refunds in full the points spent on a reward used by a cancelled order", async () => {
    const { user, staff, order } = await setup();
    await adjustPoints(prisma, { userId: user.id, actorId: staff.id, points: 150, reason: "Alta" });
    const reward = await prisma.reward.findFirstOrThrow({ where: { pointsCost: 100 } });
    const redemption = await redeemReward(prisma, user.id, { rewardId: reward.id });
    expect(await balanceOf(user.id)).toBe(50);
    // La recompensa se usa en el pedido (esto lo hace la creación del pedido).
    await prisma.rewardRedemption.update({
      where: { id: redemption.id },
      data: { status: "USED", usedAt: new Date(), orderId: order.id },
    });

    await changeOrderStatus(prisma, {
      orderId: order.id,
      to: "CANCELLED",
      actorId: staff.id,
      reason: "Cliente",
    });

    expect(await balanceOf(user.id)).toBe(150);
    const stored = await prisma.rewardRedemption.findUniqueOrThrow({
      where: { id: redemption.id },
    });
    expect(stored.status).toBe("CANCELLED");
    // Y es idempotente: no se devuelve dos veces.
    expect(
      await prisma.loyaltyTransaction.count({
        where: { redemptionId: redemption.id, type: "REVERSAL" },
      }),
    ).toBe(1);
  });

  it("lets a customer cancel only their own order and only before it is accepted", async () => {
    const { user, staff, order } = await setup();
    const stranger = await createUser(prisma);
    await expect(cancelMyOrder(prisma, stranger.id, order.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(cancelMyOrder(prisma, user.id, "no-es-un-uuid")).rejects.toMatchObject({
      status: 404,
    });

    await changeOrderStatus(prisma, { orderId: order.id, to: "ACCEPTED", actorId: staff.id });
    await expect(cancelMyOrder(prisma, user.id, order.id)).rejects.toMatchObject({
      code: "CANNOT_CANCEL",
    });

    const fresh = await createOrder(prisma, {
      userId: user.id,
      productId: (await prisma.product.findFirstOrThrow()).id,
    });
    const cancelled = await cancelMyOrder(prisma, user.id, fresh.id);
    expect(cancelled.status).toBe("CANCELLED");
    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: fresh.id } })).cancellationReason,
    ).toMatch(/cliente/i);
  });
});

describe("rewards", () => {
  async function accountWith(points: number) {
    const user = await createUser(prisma);
    const staff = await createUser(prisma);
    await createLoyaltyAccount(prisma, user.id);
    if (points > 0)
      await adjustPoints(prisma, {
        userId: user.id,
        actorId: staff.id,
        points,
        reason: "Saldo inicial",
      });
    return { user, staff };
  }
  const cheapest = () => prisma.reward.findFirstOrThrow({ where: { pointsCost: 100 } });

  it("redeems a reward, deducts the points and creates an available reward", async () => {
    const { user } = await accountWith(130);
    const redemption = await redeemReward(prisma, user.id, { rewardId: (await cheapest()).id });
    expect(redemption).toMatchObject({
      status: "AVAILABLE",
      pointsSpent: 100,
      rewardName: "Bebida gratis",
    });
    expect(await balanceOf(user.id)).toBe(30);
    const entry = await prisma.loyaltyTransaction.findFirstOrThrow({
      where: { redemptionId: redemption.id },
    });
    expect(entry).toMatchObject({ type: "REDEEM", points: -100, balanceAfter: 30 });
  });

  it("cannot redeem without enough points", async () => {
    const { user } = await accountWith(99);
    await expect(
      redeemReward(prisma, user.id, { rewardId: (await cheapest()).id }),
    ).rejects.toMatchObject({
      status: 409,
      code: "INSUFFICIENT_POINTS",
    });
    expect(await balanceOf(user.id)).toBe(99);
    expect(await prisma.rewardRedemption.count()).toBe(0);
  });

  it("two simultaneous redemptions never consume the same points", async () => {
    const { user } = await accountWith(100);
    const reward = await cheapest();
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => redeemReward(prisma, user.id, { rewardId: reward.id })),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    for (const failed of results.filter((result) => result.status === "rejected")) {
      expect((failed as PromiseRejectedResult).reason).toMatchObject({
        code: "INSUFFICIENT_POINTS",
      });
    }
    expect(await balanceOf(user.id)).toBe(0);
    expect(await prisma.rewardRedemption.count()).toBe(1);
    expect(await prisma.loyaltyTransaction.count({ where: { type: "REDEEM" } })).toBe(1);
  });

  it("respects the stock, the validity dates and inactive rewards", async () => {
    const { user } = await accountWith(500);
    const reward = await cheapest();
    await prisma.reward.update({ where: { id: reward.id }, data: { stock: 1 } });
    await redeemReward(prisma, user.id, { rewardId: reward.id });
    await expect(redeemReward(prisma, user.id, { rewardId: reward.id })).rejects.toMatchObject({
      code: "REWARD_OUT_OF_STOCK",
    });
    expect(await balanceOf(user.id)).toBe(400);

    await prisma.reward.update({
      where: { id: reward.id },
      data: { stock: null, validTo: new Date(Date.now() - 1000) },
    });
    await expect(redeemReward(prisma, user.id, { rewardId: reward.id })).rejects.toMatchObject({
      status: 404,
    });
    await prisma.reward.update({
      where: { id: reward.id },
      data: { validTo: null, active: false },
    });
    await expect(redeemReward(prisma, user.id, { rewardId: reward.id })).rejects.toMatchObject({
      status: 404,
    });
    await expect(redeemReward(prisma, user.id, { rewardId: "nope" })).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("administrative adjustments", () => {
  it("require a reason, leave a ledger entry and an audit record, and cannot go negative", async () => {
    const user = await createUser(prisma);
    const admin = await createUser(prisma);
    await expect(
      adjustPoints(prisma, { userId: user.id, actorId: admin.id, points: 50, reason: "" }),
    ).rejects.toThrow();
    await expect(
      adjustPoints(prisma, { userId: user.id, actorId: admin.id, points: 0, reason: "Nada" }),
    ).rejects.toThrow();

    const entry = await adjustPoints(prisma, {
      userId: user.id,
      actorId: admin.id,
      points: 50,
      reason: "Compensación",
    });
    expect(entry).toMatchObject({
      type: "ADJUSTMENT",
      points: 50,
      balanceAfter: 50,
      createdById: admin.id,
    });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "loyalty.adjust" } });
    expect(audit).toMatchObject({ actorId: admin.id, reason: "Compensación" });

    await expect(
      adjustPoints(prisma, {
        userId: user.id,
        actorId: admin.id,
        points: -80,
        reason: "Demasiado",
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_POINTS" });
    expect(await balanceOf(user.id)).toBe(50);
  });
});
