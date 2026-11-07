import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createOrder,
  createProduct,
  createTestClient,
  createUser,
  expectDbRejection,
  Prisma,
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
  const product = await createProduct(prisma);
  const order = await createOrder(prisma, { userId: user.id, productId: product.id });
  return { user, order };
}

const online = (orderId: string, overrides: Record<string, unknown> = {}) => ({
  orderId,
  method: "ONLINE" as const,
  status: "PENDING" as const,
  amount: new Prisma.Decimal("20.00"),
  provider: "stripe",
  ...overrides,
});

describe("payments", () => {
  it("allows several attempts for one order but only one successful collection", async () => {
    const { order } = await setup();
    await prisma.payment.create({
      data: online(order.id, {
        status: "FAILED",
        providerSessionId: "cs_1",
        failureReason: "declined",
      }),
    });
    await prisma.payment.create({
      data: online(order.id, { status: "PAID", providerSessionId: "cs_2", paidAt: new Date() }),
    });
    await expectDbRejection(
      prisma.payment.create({
        data: online(order.id, { status: "PAID", providerSessionId: "cs_3", paidAt: new Date() }),
      }),
      /unique|uq_payment_single_collected_per_order/i,
    );
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(2);
  });

  it("treats cash collection as a successful collection too", async () => {
    const { order } = await setup();
    await prisma.payment.create({
      data: {
        orderId: order.id,
        method: "CASH_PICKUP",
        status: "CASH_COLLECTED",
        amount: new Prisma.Decimal("20.00"),
        paidAt: new Date(),
      },
    });
    await expectDbRejection(
      prisma.payment.create({
        data: online(order.id, { status: "PAID", providerSessionId: "cs_x", paidAt: new Date() }),
      }),
      /unique|uq_payment_single_collected_per_order/i,
    );
  });

  it("keeps cash states separate from online payment states", async () => {
    const { order } = await setup();
    await expectDbRejection(
      prisma.payment.create({
        data: {
          orderId: order.id,
          method: "CASH_PICKUP",
          status: "PAID",
          amount: new Prisma.Decimal("20.00"),
          paidAt: new Date(),
        },
      }),
      /ck_payment_cash_statuses/,
    );
    await expectDbRejection(
      prisma.payment.create({ data: online(order.id, { status: "CASH_PENDING" }) }),
      /ck_payment_online_statuses/,
    );
    const cash = await prisma.payment.create({
      data: {
        orderId: order.id,
        method: "CASH_DELIVERY",
        status: "CASH_PENDING",
        amount: new Prisma.Decimal("20.00"),
      },
    });
    expect(cash.status).toBe("CASH_PENDING");
  });

  it("requires a provider for online payments and a payment date when paid", async () => {
    const { order } = await setup();
    await expectDbRejection(
      prisma.payment.create({ data: online(order.id, { provider: null }) }),
      /ck_payment_online_provider/,
    );
    await expectDbRejection(
      prisma.payment.create({
        data: online(order.id, { status: "PAID", providerSessionId: "cs_np" }),
      }),
      /ck_payment_paid_at/,
    );
  });

  it("does not let refunds exceed the amount and keeps refund states coherent", async () => {
    const { order } = await setup();
    await expectDbRejection(
      prisma.payment.create({
        data: online(order.id, {
          status: "PAID",
          paidAt: new Date(),
          refundedAmount: new Prisma.Decimal("25.00"),
          providerSessionId: "cs_r1",
        }),
      }),
      /ck_payment_refund/,
    );
    await expectDbRejection(
      prisma.payment.create({
        data: online(order.id, {
          status: "REFUNDED",
          refundedAmount: new Prisma.Decimal("5.00"),
          providerSessionId: "cs_r2",
        }),
      }),
      /ck_payment_refund_status/,
    );
    const partial = await prisma.payment.create({
      data: online(order.id, {
        status: "PARTIALLY_REFUNDED",
        refundedAmount: new Prisma.Decimal("5.00"),
        providerSessionId: "cs_r3",
      }),
    });
    expect(partial.refundedAmount.toString()).toBe("5");
  });

  it("rejects non-positive amounts and a repeated provider session", async () => {
    const { order } = await setup();
    await expectDbRejection(
      prisma.payment.create({ data: online(order.id, { amount: new Prisma.Decimal("0") }) }),
      /ck_payment_amount/,
    );
    await prisma.payment.create({ data: online(order.id, { providerSessionId: "cs_same" }) });
    await expectDbRejection(
      prisma.payment.create({ data: online(order.id, { providerSessionId: "cs_same" }) }),
      /unique/i,
    );
  });
});

describe("payment provider events (webhooks)", () => {
  const event = (providerEventId: string, paymentId?: string) => ({
    provider: "stripe",
    providerEventId,
    type: "checkout.session.completed",
    payload: { id: providerEventId } as Prisma.InputJsonValue,
    ...(paymentId ? { paymentId } : {}),
  });

  it("stores each provider event once, so a repeated webhook is detected", async () => {
    await prisma.paymentEvent.create({ data: event("evt_1") });
    await expectDbRejection(prisma.paymentEvent.create({ data: event("evt_1") }), /unique/i);
    await prisma.paymentEvent.create({
      data: { ...event("evt_1"), provider: "other-provider" },
    });
    expect(await prisma.paymentEvent.count()).toBe(2);
  });

  it("is append-only", async () => {
    const stored = await prisma.paymentEvent.create({ data: event("evt_2") });
    await expectDbRejection(
      prisma.paymentEvent.update({ where: { id: stored.id }, data: { type: "tampered" } }),
      /append-only/i,
    );
    await expectDbRejection(
      prisma.paymentEvent.delete({ where: { id: stored.id } }),
      /append-only/i,
    );
  });

  it("processes a duplicated webhook delivered concurrently only once", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => prisma.paymentEvent.create({ data: event("evt_race") })),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.paymentEvent.count({ where: { providerEventId: "evt_race" } })).toBe(1);
  });
});
