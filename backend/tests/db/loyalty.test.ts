import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  buildOrder,
  createLoyaltyAccount,
  createOrder,
  createProduct,
  createTestClient,
  createUser,
  expectDbRejection,
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
});

async function setup() {
  const user = await createUser(prisma);
  const account = await createLoyaltyAccount(prisma, user.id);
  const product = await createProduct(prisma);
  return { user, account, product };
}

async function reward(productId: string, pointsCost = 30) {
  return prisma.reward.create({
    data: { name: `Recompensa ${pointsCost}`, pointsCost, freeProductId: productId },
  });
}

async function newRedemption(userId: string, rewardId: string, pointsSpent = 30) {
  return prisma.rewardRedemption.create({
    data: { userId, rewardId, rewardName: "Recompensa", pointsSpent },
  });
}

async function earn(accountId: string, orderId: string, points: number) {
  return prisma.loyaltyTransaction.create({
    data: { accountId, type: "EARN", points, orderId },
  });
}

async function balanceOf(accountId: string) {
  return (await prisma.loyaltyAccount.findUniqueOrThrow({ where: { id: accountId } })).balance;
}

describe("loyalty ledger: earning points", () => {
  it("adds the points to the balance and records the balance after the movement", async () => {
    const { user, account, product } = await setup();
    const order = await createOrder(prisma, { userId: user.id, productId: product.id });

    const transaction = await earn(account.id, order.id, 20);

    expect(transaction.balanceAfter).toBe(20);
    const refreshed = await prisma.loyaltyAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(refreshed.balance).toBe(20);
    expect(refreshed.lifetimeEarned).toBe(20);
  });

  it("never grants points twice for the same order (case 4)", async () => {
    const { user, account, product } = await setup();
    const order = await createOrder(prisma, { userId: user.id, productId: product.id });

    await earn(account.id, order.id, 20);
    await expectDbRejection(earn(account.id, order.id, 20), /unique|uq_loyalty_earn_per_order/i);

    expect(await balanceOf(account.id)).toBe(20);
    expect(await prisma.loyaltyTransaction.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("requires an order for an earning movement", async () => {
    const { account } = await setup();
    await expectDbRejection(
      prisma.loyaltyTransaction.create({
        data: { accountId: account.id, type: "EARN", points: 5 },
      }),
      /ck_loyalty_tx_earn_order|check/i,
    );
  });
});

describe("loyalty ledger: redeeming points", () => {
  it("rejects a redemption without enough balance (case 5)", async () => {
    const { user, account, product } = await setup();
    const order = await createOrder(prisma, { userId: user.id, productId: product.id });
    await earn(account.id, order.id, 20);
    const redemption = await newRedemption(user.id, (await reward(product.id)).id);

    await expectDbRejection(
      prisma.loyaltyTransaction.create({
        data: { accountId: account.id, type: "REDEEM", points: -30, redemptionId: redemption.id },
      }),
      /insufficient loyalty points/i,
    );
    expect(await balanceOf(account.id)).toBe(20);
  });

  it("subtracts the points from the balance", async () => {
    const { user, account, product } = await setup();
    const order = await createOrder(prisma, { userId: user.id, productId: product.id });
    await earn(account.id, order.id, 100);
    const redemption = await newRedemption(user.id, (await reward(product.id)).id);

    const transaction = await prisma.loyaltyTransaction.create({
      data: { accountId: account.id, type: "REDEEM", points: -30, redemptionId: redemption.id },
    });

    expect(transaction.balanceAfter).toBe(70);
    expect(await balanceOf(account.id)).toBe(70);
  });

  it("two simultaneous redemptions can never spend the same points (case 6)", async () => {
    const { user, account, product } = await setup();
    const order = await createOrder(prisma, { userId: user.id, productId: product.id });
    await earn(account.id, order.id, 100);

    // Diez canjes simultáneos de 30 puntos sobre un saldo de 100: solo caben tres.
    const rewardId = (await reward(product.id)).id;
    const redemptions = await Promise.all(
      Array.from({ length: 10 }, () => newRedemption(user.id, rewardId)),
    );
    const results = await Promise.allSettled(
      redemptions.map((redemption) =>
        prisma.loyaltyTransaction.create({
          data: { accountId: account.id, type: "REDEEM", points: -30, redemptionId: redemption.id },
        }),
      ),
    );

    const succeeded = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(succeeded).toHaveLength(3);
    expect(rejected).toHaveLength(7);
    for (const result of rejected) {
      expect(String((result as PromiseRejectedResult).reason)).toMatch(
        /insufficient loyalty points/i,
      );
    }

    expect(await balanceOf(account.id)).toBe(10);
    const ledger = await prisma.loyaltyTransaction.findMany({
      where: { accountId: account.id, type: "REDEEM" },
    });
    expect(ledger).toHaveLength(3);
  });

  it("does not let the same reward redemption be charged twice", async () => {
    const { user, account, product } = await setup();
    const order = await createOrder(prisma, { userId: user.id, productId: product.id });
    await earn(account.id, order.id, 100);
    const redemption = await newRedemption(user.id, (await reward(product.id)).id);
    const data = {
      accountId: account.id,
      type: "REDEEM" as const,
      points: -30,
      redemptionId: redemption.id,
    };

    await prisma.loyaltyTransaction.create({ data });
    await expectDbRejection(
      prisma.loyaltyTransaction.create({ data }),
      /unique|uq_loyalty_redeem_per_redemption/i,
    );
    expect(await balanceOf(account.id)).toBe(70);
  });

  it("rejects an idempotency key that was already used", async () => {
    const { user, account, product } = await setup();
    const first = await createOrder(prisma, { userId: user.id, productId: product.id });
    const second = await createOrder(prisma, { userId: user.id, productId: product.id });
    await prisma.loyaltyTransaction.create({
      data: {
        accountId: account.id,
        type: "EARN",
        points: 5,
        orderId: first.id,
        idempotencyKey: "key-1",
      },
    });
    await expectDbRejection(
      prisma.loyaltyTransaction.create({
        data: {
          accountId: account.id,
          type: "EARN",
          points: 5,
          orderId: second.id,
          idempotencyKey: "key-1",
        },
      }),
      /unique|idempotencyKey/i,
    );
  });
});

describe("loyalty ledger: reversals (case 8)", () => {
  it("reverses the points of a cancelled order, once", async () => {
    const { user, account, product } = await setup();
    const order = await createOrder(prisma, { userId: user.id, productId: product.id });
    await earn(account.id, order.id, 20);
    // Saldo de otro pedido: así el segundo intento falla por el índice único y no por falta de saldo.
    const other = await createOrder(prisma, { userId: user.id, productId: product.id });
    await earn(account.id, other.id, 20);

    const reversal = await prisma.loyaltyTransaction.create({
      data: {
        accountId: account.id,
        type: "REVERSAL",
        points: -20,
        orderId: order.id,
        reason: "Pedido cancelado",
      },
    });
    expect(reversal.balanceAfter).toBe(20);
    expect(await balanceOf(account.id)).toBe(20);

    await expectDbRejection(
      prisma.loyaltyTransaction.create({
        data: { accountId: account.id, type: "REVERSAL", points: -20, orderId: order.id },
      }),
      /unique|uq_loyalty_reversal_per_order/i,
    );
    // El intento rechazado no altera el saldo.
    expect(await balanceOf(account.id)).toBe(20);
  });

  it("cannot reverse more points than the customer still has", async () => {
    const { user, account, product } = await setup();
    const order = await createOrder(prisma, { userId: user.id, productId: product.id });
    await earn(account.id, order.id, 20);
    const redemption = await newRedemption(user.id, (await reward(product.id, 15)).id, 15);
    await prisma.loyaltyTransaction.create({
      data: { accountId: account.id, type: "REDEEM", points: -15, redemptionId: redemption.id },
    });

    await expectDbRejection(
      prisma.loyaltyTransaction.create({
        data: { accountId: account.id, type: "REVERSAL", points: -20, orderId: order.id },
      }),
      /insufficient loyalty points/i,
    );
  });
});

describe("loyalty ledger: integrity", () => {
  it("does not allow changing the balance directly", async () => {
    const { account } = await setup();
    await expectDbRejection(
      prisma.loyaltyAccount.update({ where: { id: account.id }, data: { balance: 1_000_000 } }),
      /only change through ledger/i,
    );
    await expectDbRejection(
      prisma.$executeRaw`UPDATE "LoyaltyAccount" SET "lifetimeEarned" = 99 WHERE id = ${account.id}::uuid`,
      /only change through ledger/i,
    );
    expect(await balanceOf(account.id)).toBe(0);
  });

  it("does not allow creating an account with points", async () => {
    const user = await createUser(prisma);
    await expectDbRejection(
      prisma.loyaltyAccount.create({ data: { userId: user.id, balance: 500 } }),
      /start with a zero balance/i,
    );
  });

  it("never allows a negative balance, even bypassing the ledger", async () => {
    const { account } = await setup();
    await expectDbRejection(
      prisma.$executeRaw`UPDATE "LoyaltyAccount" SET "balance" = -5 WHERE id = ${account.id}::uuid`,
      /ck_loyalty_account_balance|only change through ledger|check/i,
    );
  });

  it("is append-only: movements cannot be edited or deleted", async () => {
    const { user, account, product } = await setup();
    const order = await createOrder(prisma, { userId: user.id, productId: product.id });
    const transaction = await earn(account.id, order.id, 20);

    await expectDbRejection(
      prisma.loyaltyTransaction.update({ where: { id: transaction.id }, data: { points: 9999 } }),
      /append-only/i,
    );
    await expectDbRejection(
      prisma.loyaltyTransaction.delete({ where: { id: transaction.id } }),
      /append-only/i,
    );
    expect(await balanceOf(account.id)).toBe(20);
  });

  it("requires a reason and an author for administrative adjustments", async () => {
    const { account } = await setup();
    const admin = await createUser(prisma);

    await expectDbRejection(
      prisma.loyaltyTransaction.create({
        data: { accountId: account.id, type: "ADJUSTMENT", points: 50 },
      }),
      /ck_loyalty_tx_adjustment|check/i,
    );
    await expectDbRejection(
      prisma.loyaltyTransaction.create({
        data: {
          accountId: account.id,
          type: "ADJUSTMENT",
          points: 50,
          reason: "   ",
          createdById: admin.id,
        },
      }),
      /ck_loyalty_tx_adjustment|check/i,
    );

    const adjustment = await prisma.loyaltyTransaction.create({
      data: {
        accountId: account.id,
        type: "ADJUSTMENT",
        points: 50,
        reason: "Compensación por un pedido retrasado",
        createdById: admin.id,
      },
    });
    expect(adjustment.balanceAfter).toBe(50);
  });

  it("enforces the sign of each movement type and rejects zero-point movements", async () => {
    const { user, account, product } = await setup();
    const order = await createOrder(prisma, { userId: user.id, productId: product.id });
    const redemption = await newRedemption(user.id, (await reward(product.id)).id);
    // Saldo previo: el trigger del libro se ejecuta antes que los CHECK, y sin saldo fallaría él primero.
    const funding = await createOrder(prisma, { userId: user.id, productId: product.id });
    await earn(account.id, funding.id, 50);

    await expectDbRejection(
      prisma.loyaltyTransaction.create({
        data: { accountId: account.id, type: "EARN", points: -5, orderId: order.id },
      }),
      /ck_loyalty_tx_sign|check/i,
    );
    await expectDbRejection(
      prisma.loyaltyTransaction.create({
        data: { accountId: account.id, type: "REDEEM", points: 5, redemptionId: redemption.id },
      }),
      /ck_loyalty_tx_sign|check/i,
    );
    await expectDbRejection(
      prisma.loyaltyTransaction.create({
        data: { accountId: account.id, type: "EARN", points: 0, orderId: order.id },
      }),
      /ck_loyalty_tx_points|check/i,
    );
    // Ningún intento rechazado deja rastro en el saldo (la sentencia entera se revierte).
    expect(await balanceOf(account.id)).toBe(50);
    expect(await prisma.loyaltyTransaction.count()).toBe(1);
  });

  it("keeps the balance equal to the sum of the ledger and balanceAfter consistent", async () => {
    const { user, account, product } = await setup();
    const orders = await Promise.all(
      [1, 2, 3].map(() => createOrder(prisma, { userId: user.id, productId: product.id })),
    );
    for (const [index, order] of orders.entries()) {
      await earn(account.id, order.id, (index + 1) * 10);
    }
    const redemption = await newRedemption(user.id, (await reward(product.id, 25)).id, 25);
    await prisma.loyaltyTransaction.create({
      data: { accountId: account.id, type: "REDEEM", points: -25, redemptionId: redemption.id },
    });

    const ledger = await prisma.loyaltyTransaction.findMany({
      where: { accountId: account.id },
      orderBy: { createdAt: "asc" },
    });
    const sum = ledger.reduce((total, movement) => total + movement.points, 0);
    expect(sum).toBe(35);
    expect(await balanceOf(account.id)).toBe(sum);

    let running = 0;
    for (const movement of ledger) {
      running += movement.points;
      expect(movement.balanceAfter).toBe(running);
    }
  });

  it("is rolled back with its transaction: no points if the order write fails", async () => {
    const { user, account, product } = await setup();
    await expect(
      prisma.$transaction(async (tx) => {
        const order = await tx.order.create({
          data: buildOrder({ userId: user.id, productId: product.id }),
        });
        await tx.loyaltyTransaction.create({
          data: { accountId: account.id, type: "EARN", points: 20, orderId: order.id },
        });
        throw new Error("simulated failure after granting points");
      }),
    ).rejects.toThrow(/simulated failure/);

    expect(await balanceOf(account.id)).toBe(0);
    expect(await prisma.loyaltyTransaction.count()).toBe(0);
    expect(await prisma.order.count()).toBe(0);
  });
});

describe("loyalty ledger: cancelled orders (decided policy, never a negative balance)", () => {
  it("refunds in full the points spent on an order that ends up cancelled", async () => {
    const { user, account, product } = await setup();
    const funding = await createOrder(prisma, { userId: user.id, productId: product.id });
    await earn(account.id, funding.id, 100);

    // El cliente gasta 30 puntos en un pedido...
    const order = await createOrder(prisma, { userId: user.id, productId: product.id });
    const redemption = await prisma.rewardRedemption.create({
      data: {
        userId: user.id,
        rewardId: (await reward(product.id, 30)).id,
        rewardName: "Recompensa",
        pointsSpent: 30,
        orderId: order.id,
      },
    });
    await prisma.loyaltyTransaction.create({
      data: { accountId: account.id, type: "REDEEM", points: -30, redemptionId: redemption.id },
    });
    expect(await balanceOf(account.id)).toBe(70);

    // ...y el pedido se cancela: se devuelven los 30 puntos completos (solo con redemptionId).
    await prisma.$transaction([
      prisma.loyaltyTransaction.create({
        data: {
          accountId: account.id,
          type: "REVERSAL",
          points: 30,
          redemptionId: redemption.id,
          reason: "Pedido cancelado: devolución de puntos canjeados",
        },
      }),
      prisma.rewardRedemption.update({
        where: { id: redemption.id },
        data: { status: "CANCELLED", cancelledAt: new Date() },
      }),
    ]);
    expect(await balanceOf(account.id)).toBe(100);

    // La devolución solo puede hacerse una vez.
    await expectDbRejection(
      prisma.loyaltyTransaction.create({
        data: { accountId: account.id, type: "REVERSAL", points: 30, redemptionId: redemption.id },
      }),
      /unique|uq_loyalty_reversal_per_redemption/i,
    );
    expect(await balanceOf(account.id)).toBe(100);
  });

  it("reverses only what is left when earned points were already spent, keeping the balance at zero or more", async () => {
    const { user, account, product } = await setup();
    const order = await createOrder(prisma, { userId: user.id, productId: product.id });
    await earn(account.id, order.id, 20);
    const redemption = await newRedemption(user.id, (await reward(product.id, 15)).id, 15);
    await prisma.loyaltyTransaction.create({
      data: { accountId: account.id, type: "REDEEM", points: -15, redemptionId: redemption.id },
    });

    // Del pedido cancelado se habían ganado 20 puntos, pero solo quedan 5: se revierten esos 5.
    const reversal = await prisma.loyaltyTransaction.create({
      data: {
        accountId: account.id,
        type: "REVERSAL",
        points: -5,
        orderId: order.id,
        reason: "Pedido cancelado: se revierten 5 de 20 puntos (15 ya canjeados)",
      },
    });
    expect(reversal.balanceAfter).toBe(0);
    expect(await balanceOf(account.id)).toBe(0);

    const ledger = await prisma.loyaltyTransaction.findMany({ where: { accountId: account.id } });
    expect(ledger.every((movement) => movement.balanceAfter >= 0)).toBe(true);
    // Lo ganado en total no cambia: la reversión es un movimiento propio del libro.
    const refreshed = await prisma.loyaltyAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(refreshed.lifetimeEarned).toBe(20);
  });
});
