import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  buildOrder,
  createOrder,
  createProduct,
  createTestClient,
  createUser,
  expectDbRejection,
  orderLine,
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
  return { user, product };
}

describe("order totals", () => {
  it("accepts a coherent pickup order and a coherent delivery order", async () => {
    const { user, product } = await setup();
    const pickup = await createOrder(prisma, { userId: user.id, productId: product.id });
    const delivery = await createOrder(prisma, {
      userId: user.id,
      productId: product.id,
      type: "DELIVERY",
    });

    expect(pickup.total.toString()).toBe("20");
    expect(delivery.total.toString()).toBe("22.5");
  });

  it("rejects a total that is not subtotal - discounts + delivery fee", async () => {
    const { user, product } = await setup();
    const data = buildOrder({ userId: user.id, productId: product.id });
    await expectDbRejection(
      prisma.order.create({
        // IVA pequeño para que solo se incumpla la regla del total.
        data: { ...data, total: new Prisma.Decimal("1.00"), taxTotal: new Prisma.Decimal("0.05") },
      }),
      /ck_order_total/,
    );
  });

  it("rejects a subtotal that does not match the sum of its lines (checked at commit)", async () => {
    const { user, product } = await setup();
    const data = buildOrder({ userId: user.id, productId: product.id });
    // Subtotal y total coherentes entre sí, pero distintos de la suma de líneas (20,00).
    await expectDbRejection(
      prisma.order.create({
        data: {
          ...data,
          subtotal: new Prisma.Decimal("5.00"),
          total: new Prisma.Decimal("5.00"),
          taxTotal: new Prisma.Decimal("0.45"),
        },
      }),
      /does not match the sum of its lines/i,
    );
    expect(await prisma.order.count()).toBe(0);
  });

  it("rejects an order with no lines and a positive subtotal", async () => {
    const { user } = await setup();
    await expectDbRejection(
      prisma.order.create({
        data: {
          userId: user.id,
          type: "PICKUP",
          customerName: "Cliente",
          customerEmail: "cliente@example.test",
          subtotal: new Prisma.Decimal("10.00"),
          total: new Prisma.Decimal("10.00"),
          taxTotal: new Prisma.Decimal("0.91"),
        },
      }),
      /does not match the sum of its lines/i,
    );
  });

  it("detects a line deleted after the order was placed", async () => {
    const { user, product } = await setup();
    const order = await createOrder(prisma, { userId: user.id, productId: product.id });
    await expectDbRejection(
      prisma.orderItem.deleteMany({ where: { orderId: order.id } }),
      /does not match the sum of its lines/i,
    );
    expect(await prisma.orderItem.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("rejects a discount larger than the subtotal and negative amounts", async () => {
    const { user, product } = await setup();
    await expectDbRejection(
      prisma.order.create({
        data: buildOrder({ userId: user.id, productId: product.id, discountTotal: "50.00" }),
      }),
      /ck_order_(total|discount_not_above_subtotal|amounts_positive)/,
    );
  });
});

describe("order lines", () => {
  it("rejects a quantity of zero or less", async () => {
    const { user, product } = await setup();
    await expectDbRejection(
      prisma.order.create({
        data: buildOrder({ userId: user.id, productId: product.id, quantity: 0 }),
      }),
      /ck_order_item_quantity/,
    );
  });

  it("rejects a line total that is not unit price x quantity", async () => {
    const { user, product } = await setup();
    const data = buildOrder({ userId: user.id, productId: product.id });
    const line = orderLine(data);
    await expectDbRejection(
      prisma.order.create({
        data: { ...data, items: { create: [{ ...line, lineTotal: new Prisma.Decimal("19.00") }] } },
      }),
      /ck_order_item_line_total/,
    );
  });

  it("rejects VAT that does not match the VAT-inclusive price", async () => {
    const { user, product } = await setup();
    const data = buildOrder({ userId: user.id, productId: product.id });
    const line = orderLine(data);
    // 20,00 € con IVA del 10 % incluido contienen 1,82 € de IVA, no 5,00 €.
    await expectDbRejection(
      prisma.order.create({
        data: { ...data, items: { create: [{ ...line, taxAmount: new Prisma.Decimal("5.00") }] } },
      }),
      /ck_order_item_tax_amount/,
    );
  });

  it("computes the VAT contained in the price for the 21 % rate as well", async () => {
    const { user, product } = await setup();
    const order = await createOrder(prisma, {
      userId: user.id,
      productId: product.id,
      unitPrice: "3.00",
      quantity: 1,
      taxRate: "21.00",
    });
    const [line] = await prisma.orderItem.findMany({ where: { orderId: order.id } });
    expect(line?.taxAmount.toString()).toBe("0.52");
  });
});

describe("delivery and pickup rules", () => {
  it("requires a delivery address for delivery orders (case 9)", async () => {
    const { user, product } = await setup();
    const data = buildOrder({ userId: user.id, productId: product.id, type: "DELIVERY" });
    await expectDbRejection(
      prisma.order.create({ data: { ...data, deliveryLine1: null } }),
      /ck_order_delivery_address/,
    );
    await expectDbRejection(
      prisma.order.create({ data: { ...data, deliveryPostalCode: null } }),
      /ck_order_delivery_address/,
    );
  });

  it("does not allow delivery fees on pickup orders", async () => {
    const { user, product } = await setup();
    const data = buildOrder({ userId: user.id, productId: product.id });
    await expectDbRejection(
      prisma.order.create({
        data: {
          ...data,
          deliveryFee: new Prisma.Decimal("2.50"),
          total: new Prisma.Decimal("22.50"),
        },
      }),
      /ck_order_pickup_no_fee/,
    );
  });

  it("requires a cancellation date for cancelled or rejected orders and a date for completed ones", async () => {
    const { user, product } = await setup();
    await expectDbRejection(
      prisma.order.create({
        data: buildOrder({ userId: user.id, productId: product.id, status: "CANCELLED" }),
      }),
      /ck_order_cancelled_at/,
    );
    await expectDbRejection(
      prisma.order.create({
        data: buildOrder({ userId: user.id, productId: product.id, status: "COMPLETED" }),
      }),
      /ck_order_completed_at/,
    );
    const cancelled = await prisma.order.create({
      data: {
        ...buildOrder({ userId: user.id, productId: product.id, status: "CANCELLED" }),
        cancelledAt: new Date(),
      },
    });
    expect(cancelled.status).toBe("CANCELLED");
  });
});

describe("order history and snapshots", () => {
  it("gives every order a correlative, human-readable number", async () => {
    const { user, product } = await setup();
    const orders = [];
    for (let i = 0; i < 3; i += 1) {
      orders.push(await createOrder(prisma, { userId: user.id, productId: product.id }));
    }
    const numbers = orders.map((order) => order.orderNumber);
    expect(numbers).toEqual([numbers[0]!, numbers[0]! + 1, numbers[0]! + 2]);
  });

  it("keeps historical orders unchanged when the menu changes", async () => {
    const { user, product } = await setup();
    const order = await prisma.order.create({
      data: {
        ...buildOrder({ userId: user.id, productId: product.id, unitPrice: "10.00" }),
      },
      include: { items: true },
    });

    await prisma.product.update({
      where: { id: product.id },
      data: { name: "Nombre nuevo", basePrice: new Prisma.Decimal("99.00"), deletedAt: new Date() },
    });

    const reloaded = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: true },
    });
    expect(reloaded.items[0]?.productName).toBe("Producto de prueba");
    expect(reloaded.items[0]?.unitPrice.toString()).toBe("10");
    expect(reloaded.total.toString()).toBe("20");
  });

  it("does not allow deleting a product that appears in an order, or a customer with orders", async () => {
    const { user, product } = await setup();
    await createOrder(prisma, { userId: user.id, productId: product.id });
    await expectDbRejection(
      prisma.product.delete({ where: { id: product.id } }),
      /foreign key|constraint/i,
    );
    await expectDbRejection(
      prisma.profile.delete({ where: { id: user.id } }),
      /foreign key|constraint/i,
    );
  });

  it("records status changes in an append-only history", async () => {
    const { user, product } = await setup();
    const order = await createOrder(prisma, { userId: user.id, productId: product.id });
    const entry = await prisma.orderStatusHistory.create({
      data: { orderId: order.id, fromStatus: null, toStatus: "NEW" },
    });

    await expectDbRejection(
      prisma.orderStatusHistory.update({
        where: { id: entry.id },
        data: { toStatus: "COMPLETED" },
      }),
      /append-only/i,
    );
    await expectDbRejection(
      prisma.orderStatusHistory.delete({ where: { id: entry.id } }),
      /append-only/i,
    );
  });
});

describe("payment must be confirmed before an order moves on (case 7)", () => {
  async function pendingOnlineOrder() {
    const { user, product } = await setup();
    const order = await createOrder(prisma, {
      userId: user.id,
      productId: product.id,
      status: "PENDING_PAYMENT",
    });
    return order;
  }

  it("keeps a PENDING_PAYMENT order from advancing without a confirmed payment", async () => {
    const order = await pendingOnlineOrder();
    await expectDbRejection(
      prisma.order.update({ where: { id: order.id }, data: { status: "NEW" } }),
      /cannot leave PENDING_PAYMENT without a confirmed payment/i,
    );
  });

  it("does not let a failed payment turn the order into a paid one", async () => {
    const order = await pendingOnlineOrder();
    await prisma.payment.create({
      data: {
        orderId: order.id,
        method: "ONLINE",
        status: "FAILED",
        amount: order.total,
        provider: "stripe",
        providerSessionId: "cs_test_failed",
        failureReason: "card_declined",
      },
    });
    await expectDbRejection(
      prisma.order.update({ where: { id: order.id }, data: { status: "ACCEPTED" } }),
      /cannot leave PENDING_PAYMENT without a confirmed payment/i,
    );
  });

  it("lets the order advance once the payment is confirmed", async () => {
    const order = await pendingOnlineOrder();
    await prisma.payment.create({
      data: {
        orderId: order.id,
        method: "ONLINE",
        status: "PAID",
        amount: order.total,
        provider: "stripe",
        providerSessionId: "cs_test_paid",
        paidAt: new Date(),
      },
    });
    const updated = await prisma.order.update({ where: { id: order.id }, data: { status: "NEW" } });
    expect(updated.status).toBe("NEW");
  });

  it("lets a pending-payment order be cancelled without any payment", async () => {
    const order = await pendingOnlineOrder();
    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    expect(updated.status).toBe("CANCELLED");
  });
});
