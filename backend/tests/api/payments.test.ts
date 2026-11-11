import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { seedDemoData } from "../../prisma/seed-demo-data.js";
import { listKitchenOrders } from "../../src/modules/kitchen/kitchen.service.js";
import { changeOrderStatus } from "../../src/modules/orders/status.service.js";
import { handleOrderEvent } from "../../src/modules/orders/order-effects.js";
import { createLogMailer } from "../../src/modules/notifications/mailer.js";
import { createTestClient, resetDatabase, type PrismaClient } from "../db/helpers.js";
import { createTestApp } from "../helpers/app.js";
import { appWithPayments, createFakeGateway, signedWebhook } from "../helpers/payments.js";

let prisma: PrismaClient;
let ctx: Awaited<ReturnType<typeof createTestApp>>;
let fake: ReturnType<typeof createFakeGateway>;
let app: ReturnType<typeof appWithPayments>;

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
  await prisma.storeSettings.update({
    where: { id: 1 },
    data: { enabledPaymentMethods: ["ONLINE", "CASH_PICKUP", "CASH_DELIVERY"] },
  });
  fake = createFakeGateway();
  app = appWithPayments(prisma, ctx, fake.gateway);
});

async function line(slug = "margherita") {
  const product = await prisma.product.findFirstOrThrow({
    where: { slug },
    include: { optionGroups: { include: { options: true } } },
  });
  const optionIds = product.optionGroups
    .filter((group) => group.required)
    .flatMap((group) =>
      group.options.filter((option) => option.isDefault).map((option) => option.id),
    );
  return { productId: product.id, quantity: 1, optionIds };
}

async function customer() {
  return ctx.userWithToken({
    username: `cliente${randomUUID().slice(0, 4)}`,
    phone: "+34 600 000 000",
  });
}

/** Un pedido online recién creado por la API (queda pendiente de pago). */
async function onlineOrder(
  who?: Awaited<ReturnType<typeof customer>>,
  target: ReturnType<typeof appWithPayments> = app,
) {
  const owner = who ?? (await customer());
  const response = await request(target)
    .post("/api/v1/orders")
    .set(owner.headers)
    .set("Idempotency-Key", randomUUID())
    .send({ items: [await line()], type: "PICKUP", paymentMethod: "ONLINE" });
  return { owner, response, id: response.body.data?.id as string };
}

function sessionObject(order: { id: string }, payment: { id: string }, extra: object = {}) {
  return {
    id: "cs_test_1",
    payment_status: "paid",
    payment_intent: "pi_test_1",
    currency: "eur",
    metadata: { orderId: order.id, paymentId: payment.id },
    ...extra,
  };
}

async function paymentOf(orderId: string) {
  return prisma.payment.findFirstOrThrow({ where: { orderId } });
}

async function paidOrder() {
  const { owner, id } = await onlineOrder();
  const payment = await paymentOf(id);
  const res = await signedWebhook(app, {
    type: "checkout.session.completed",
    object: sessionObject({ id }, payment, { amount_total: Number(payment.amount) * 100 }),
  });
  expect(res.status).toBe(200);
  return { owner, id, payment: await paymentOf(id) };
}

describe("availability of online payment", () => {
  it("is not offered nor accepted without a payment gateway configured", async () => {
    const settings = await request(ctx.app).get("/api/v1/store/settings");
    expect(settings.body.data.enabledPaymentMethods).not.toContain("ONLINE");

    const { response } = await onlineOrder(undefined, ctx.app as never);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("PAYMENT_METHOD_UNAVAILABLE");
    expect(await prisma.order.count()).toBe(0);
  });

  it("is offered once the gateway is configured", async () => {
    const settings = await request(app).get("/api/v1/store/settings");
    expect(settings.body.data.enabledPaymentMethods).toContain("ONLINE");
  });
});

describe("creating an online order", () => {
  it("stays pending payment, hidden from the kitchen, with a pending payment and no points or tickets", async () => {
    const { response, id } = await onlineOrder();
    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe("PENDING_PAYMENT");
    expect(response.body.data.payments).toEqual([
      expect.objectContaining({ method: "ONLINE", status: "PENDING" }),
    ]);
    expect((await listKitchenOrders(prisma)).map((order) => order.id)).not.toContain(id);
  });
});

describe("payment session", () => {
  it("is created for the owner with the order amount in cents and reused while open", async () => {
    const { owner, id } = await onlineOrder();
    const order = await prisma.order.findUniqueOrThrow({ where: { id } });
    const first = await request(app)
      .post(`/api/v1/orders/${id}/payment-session`)
      .set(owner.headers);
    expect(first.status).toBe(200);
    expect(first.body.data.url).toMatch(/^https:\/\/checkout\.stripe\.test\//);
    expect(fake.state.created[0]).toMatchObject({
      orderId: id,
      amountCents: Math.round(Number(order.total) * 100),
      currency: "EUR",
      successUrl: `http://localhost:3000/pedido/${id}?pago=ok`,
      cancelUrl: `http://localhost:3000/pedido/${id}?pago=cancelado`,
    });

    const again = await request(app)
      .post(`/api/v1/orders/${id}/payment-session`)
      .set(owner.headers);
    expect(again.body.data.url).toBe(first.body.data.url);
    expect(fake.state.created).toHaveLength(1);

    // La URL de vuelta del navegador no prueba nada: sigue pendiente.
    expect((await prisma.order.findUniqueOrThrow({ where: { id } })).status).toBe(
      "PENDING_PAYMENT",
    );
    expect((await paymentOf(id)).status).toBe("PENDING");
  });

  it("creates a new session when the previous one expired", async () => {
    const { owner, id } = await onlineOrder();
    await request(app).post(`/api/v1/orders/${id}/payment-session`).set(owner.headers);
    fake.state.sessions.get("cs_test_1")!.status = "expired";
    const again = await request(app)
      .post(`/api/v1/orders/${id}/payment-session`)
      .set(owner.headers);
    expect(again.status).toBe(200);
    expect(fake.state.created).toHaveLength(2);
    expect(fake.state.created[1]!.idempotencyKey).not.toBe(fake.state.created[0]!.idempotencyKey);
  });

  it("is refused for someone else's order, a cash order and without a gateway", async () => {
    const { id } = await onlineOrder();
    const stranger = await customer();
    expect(
      (await request(app).post(`/api/v1/orders/${id}/payment-session`).set(stranger.headers))
        .status,
    ).toBe(404);

    const mine = await customer();
    const cash = await request(app)
      .post("/api/v1/orders")
      .set(mine.headers)
      .set("Idempotency-Key", randomUUID())
      .send({ items: [await line()], type: "PICKUP", paymentMethod: "CASH_PICKUP" });
    const refused = await request(app)
      .post(`/api/v1/orders/${cash.body.data.id}/payment-session`)
      .set(mine.headers);
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe("ORDER_NOT_PAYABLE");

    const nobody = await request(ctx.app)
      .post(`/api/v1/orders/${id}/payment-session`)
      .set((await customer()).headers);
    expect(nobody.body.error.code).toBe("PAYMENTS_NOT_CONFIGURED");
    expect((await request(app).post(`/api/v1/orders/${id}/payment-session`)).status).toBe(401);
  });
});

describe("webhook: a failed or forged payment never produces a paid order (critical case 7)", () => {
  it("rejects missing, wrong and tampered signatures without changing anything", async () => {
    const { id } = await onlineOrder();
    const payment = await paymentOf(id);
    const event = {
      type: "checkout.session.completed",
      object: sessionObject({ id }, payment, { amount_total: Number(payment.amount) * 100 }),
    };

    for (const options of [
      { signature: null },
      { signature: "t=1,v1=deadbeef" },
      { secret: "whsec_another_secret_entirely" },
    ]) {
      const res = await signedWebhook(app, event, options);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_SIGNATURE");
    }
    // Cuerpo alterado tras firmar.
    const good = await signedWebhook(app, event);
    expect(good.status).toBe(200);
    const tampered = JSON.stringify({
      id: "evt_x",
      object: "event",
      type: event.type,
      data: { object: event.object },
    });
    const signed = await signedWebhook(app, event, {
      payload: tampered.replace("cs_test_1", "cs_other"),
      signature: "t=1,v1=00",
    });
    expect(signed.status).toBe(400);
    expect(await prisma.paymentEvent.count()).toBe(1);
  });

  it("marks the payment as paid and the order as new only with an authentic event", async () => {
    const { id } = await onlineOrder();
    const payment = await paymentOf(id);
    const res = await signedWebhook(app, {
      type: "checkout.session.completed",
      object: sessionObject({ id }, payment, { amount_total: Number(payment.amount) * 100 }),
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, outcome: "processed" });

    const order = await prisma.order.findUniqueOrThrow({ where: { id } });
    expect(order.status).toBe("NEW");
    const paid = await paymentOf(id);
    expect(paid).toMatchObject({ status: "PAID", providerPaymentId: "pi_test_1" });
    expect(paid.paidAt).not.toBeNull();
    expect((await listKitchenOrders(prisma)).map((entry) => entry.id)).toContain(id);
    const history = await prisma.orderStatusHistory.findMany({
      where: { orderId: id },
      orderBy: { createdAt: "asc" },
    });
    expect(history.map((entry) => entry.toStatus)).toEqual(["PENDING_PAYMENT", "NEW"]);
    expect(history[1]!.changedById).toBeNull();
  });

  it("processes a repeated or simultaneous event only once (idempotency)", async () => {
    const { id } = await onlineOrder();
    const payment = await paymentOf(id);
    const event = {
      id: "evt_same_event",
      type: "checkout.session.completed",
      object: sessionObject({ id }, payment, { amount_total: Number(payment.amount) * 100 }),
    };
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => signedWebhook(app, event)));
    expect(results.every((res) => res.status === 200)).toBe(true);
    const again = await signedWebhook(app, event);
    expect(again.body.outcome).toBe("duplicate");

    expect(await prisma.paymentEvent.count({ where: { providerEventId: "evt_same_event" } })).toBe(
      1,
    );
    const history = await prisma.orderStatusHistory.findMany({
      where: { orderId: id, toStatus: "NEW" },
    });
    expect(history).toHaveLength(1);
  });

  it("does not trust a paid event whose amount or currency differs from the order", async () => {
    const { id } = await onlineOrder();
    const payment = await paymentOf(id);
    await signedWebhook(app, {
      type: "checkout.session.completed",
      object: sessionObject({ id }, payment, { amount_total: 1 }),
    });
    expect((await prisma.order.findUniqueOrThrow({ where: { id } })).status).toBe(
      "PENDING_PAYMENT",
    );
    expect(await paymentOf(id)).toMatchObject({
      status: "FAILED",
      failureReason: "AMOUNT_MISMATCH",
    });

    const second = await onlineOrder();
    const secondPayment = await paymentOf(second.id);
    await signedWebhook(app, {
      type: "checkout.session.completed",
      object: sessionObject({ id: second.id }, secondPayment, {
        amount_total: Number(secondPayment.amount) * 100,
        currency: "usd",
      }),
    });
    expect((await paymentOf(second.id)).status).toBe("FAILED");
  });

  it("ignores unpaid sessions, unknown payments and unrelated events", async () => {
    const { id } = await onlineOrder();
    const payment = await paymentOf(id);
    await signedWebhook(app, {
      type: "checkout.session.completed",
      object: sessionObject({ id }, payment, { payment_status: "unpaid", amount_total: 1 }),
    });
    await signedWebhook(app, {
      type: "checkout.session.completed",
      object: sessionObject({ id: randomUUID() }, { id: randomUUID() }, { amount_total: 1 }),
    });
    const unrelated = await signedWebhook(app, {
      type: "customer.created",
      object: { id: "cus_1" },
    });
    expect(unrelated.body.outcome).toBe("ignored");
    expect((await prisma.order.findUniqueOrThrow({ where: { id } })).status).toBe(
      "PENDING_PAYMENT",
    );
    expect((await paymentOf(id)).status).toBe("PENDING");
  });

  it("a failed attempt keeps the order waiting; an expired session cancels it and frees the points", async () => {
    const { id } = await onlineOrder();
    const payment = await paymentOf(id);
    await signedWebhook(app, {
      type: "payment_intent.payment_failed",
      object: {
        id: "pi_1",
        metadata: { paymentId: payment.id },
        last_payment_error: { message: "Your card was declined." },
      },
    });
    expect(await paymentOf(id)).toMatchObject({
      status: "PENDING",
      failureReason: "Your card was declined.",
    });
    expect((await prisma.order.findUniqueOrThrow({ where: { id } })).status).toBe(
      "PENDING_PAYMENT",
    );

    await signedWebhook(app, {
      type: "checkout.session.expired",
      object: { id: "cs_test_1", metadata: { orderId: id, paymentId: payment.id } },
    });
    expect(await paymentOf(id)).toMatchObject({
      status: "FAILED",
      failureReason: "SESSION_EXPIRED",
    });
    const order = await prisma.order.findUniqueOrThrow({ where: { id } });
    expect(order.status).toBe("CANCELLED");
    expect(order.cancellationReason).toBe("Pago no completado");
  });

  it("refunds automatically a payment that arrives after the order was cancelled", async () => {
    const { owner, id } = await onlineOrder();
    await request(app).post(`/api/v1/orders/${id}/cancel`).set(owner.headers);
    const payment = await paymentOf(id);
    await signedWebhook(app, {
      type: "checkout.session.completed",
      object: sessionObject({ id }, payment, { amount_total: Number(payment.amount) * 100 }),
    });
    expect(fake.state.refunds).toHaveLength(1);
    expect(fake.state.refunds[0]!.amountCents).toBe(Math.round(Number(payment.amount) * 100));
    expect((await paymentOf(id)).status).toBe("REFUNDED");
    expect((await prisma.order.findUniqueOrThrow({ where: { id } })).status).toBe("CANCELLED");
  });
});

describe("refunds", () => {
  async function adminOf() {
    const admin = await ctx.userWithToken({ username: "admin_1", phone: "+34 600 000 001" });
    await prisma.userRole.create({ data: { userId: admin.user.id, role: "ADMIN" } });
    return admin;
  }

  it("needs payments:refund and a session", async () => {
    const { id } = await paidOrder();
    const staff = await ctx.userWithToken({ username: "staff_1", phone: "+34 600 000 002" });
    await prisma.userRole.create({ data: { userId: staff.user.id, role: "STAFF" } });
    const body = { reason: "Cliente insatisfecho" };
    expect((await request(app).post(`/api/v1/admin/orders/${id}/refund`).send(body)).status).toBe(
      401,
    );
    expect(
      (await request(app).post(`/api/v1/admin/orders/${id}/refund`).set(staff.headers).send(body))
        .status,
    ).toBe(403);
    expect(fake.state.refunds).toHaveLength(0);
  });

  it("refunds part and then the rest, audited, and refuses more than was paid", async () => {
    const { id, payment } = await paidOrder();
    const admin = await adminOf();
    const post = (body: object) =>
      request(app).post(`/api/v1/admin/orders/${id}/refund`).set(admin.headers).send(body);

    expect((await post({ reason: "x" })).status).toBe(400); // motivo demasiado corto
    const partial = await post({ amount: "2.00", reason: "Producto frío" });
    expect(partial.status).toBe(200);
    expect(partial.body.data.payments[0]).toMatchObject({
      status: "PARTIALLY_REFUNDED",
      refundedAmount: "2.00",
    });
    expect(fake.state.refunds[0]).toMatchObject({ amountCents: 200, paymentIntentId: "pi_test_1" });

    const tooMuch = await post({ amount: payment.amount.toFixed(2), reason: "Demasiado" });
    expect(tooMuch.status).toBe(422);
    expect(tooMuch.body.error.code).toBe("INVALID_REFUND_AMOUNT");

    const rest = await post({ reason: "Resto del importe" });
    expect(rest.status).toBe(200);
    expect(rest.body.data.payments[0].status).toBe("REFUNDED");
    expect(fake.state.refunds[1]!.amountCents).toBe(Math.round((Number(payment.amount) - 2) * 100));
    expect((await post({ reason: "Otra vez" })).status).toBe(404); // ya no queda nada que devolver

    const audit = await prisma.auditLog.findMany({ where: { action: "payment.refund" } });
    expect(audit).toHaveLength(2);
    expect(audit[0]).toMatchObject({ actorId: admin.user.id, reason: "Producto frío" });
  });

  it("does not refund an unpaid or cash payment", async () => {
    const admin = await adminOf();
    const { id } = await onlineOrder();
    const res = await request(app)
      .post(`/api/v1/admin/orders/${id}/refund`)
      .set(admin.headers)
      .send({ reason: "Sin cobrar" });
    expect(res.status).toBe(404);
    expect(fake.state.refunds).toHaveLength(0);
  });

  it("reflects what the provider says (charge.refunded) as an absolute value", async () => {
    const { payment } = await paidOrder();
    const event = {
      type: "charge.refunded",
      object: { payment_intent: "pi_test_1", amount: 1000, amount_refunded: 300 },
    };
    await signedWebhook(app, event);
    await signedWebhook(app, { ...event, id: "evt_again" });
    const refreshed = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(refreshed.status).toBe("PARTIALLY_REFUNDED");
    expect(refreshed.refundedAmount.toFixed(2)).toBe("3.00");
  });

  it("reports a provider failure without changing the payment", async () => {
    const { id, payment } = await paidOrder();
    const admin = await adminOf();
    fake.state.failRefunds = true;
    const res = await request(app)
      .post(`/api/v1/admin/orders/${id}/refund`)
      .set(admin.headers)
      .send({ reason: "Prueba de fallo" });
    expect(res.status).toBe(502);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe(
      "PAID",
    );
  });
});

describe("side effects of a cancelled paid order", () => {
  it("refunds the online payment when the order is cancelled or rejected, once", async () => {
    const { id } = await paidOrder();
    const event = { kind: "status" as const, orderId: id, orderNumber: 1, status: "CANCELLED" };
    await changeOrderStatus(prisma, {
      orderId: id,
      to: "CANCELLED",
      actorId: null,
      reason: "Prueba",
    });
    const deps = { mailer: createLogMailer(), gateway: fake.gateway };
    await handleOrderEvent(prisma, deps, event);
    await handleOrderEvent(prisma, deps, event);
    expect(fake.state.refunds).toHaveLength(1);
    expect((await paymentOf(id)).status).toBe("REFUNDED");
  });

  it("never lets a refund failure break the order flow", async () => {
    const { id } = await paidOrder();
    fake.state.failRefunds = true;
    await changeOrderStatus(prisma, {
      orderId: id,
      to: "REJECTED",
      actorId: null,
      reason: "Prueba",
    });
    await expect(
      handleOrderEvent(
        prisma,
        { mailer: createLogMailer(), gateway: fake.gateway },
        {
          kind: "status",
          orderId: id,
          orderNumber: 1,
          status: "REJECTED",
        },
      ),
    ).resolves.toBeUndefined();
    expect((await paymentOf(id)).status).toBe("PAID");
  });
});
