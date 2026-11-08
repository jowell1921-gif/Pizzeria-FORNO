import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  Cart,
  ErrorResponse,
  Order,
  Quote,
  StoreSettings,
  StoreSlots,
  data,
} from "../../src/docs/schemas.js";
import { seedDemoData } from "../../prisma/seed-demo-data.js";
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
  // Abierto las 24 horas, todos los días: así «lo antes posible» no depende de cuándo se ejecute.
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

/** Línea de carrito con las opciones por defecto de los grupos obligatorios. */
async function line(slug: string, quantity = 1, extraOptions: string[] = []) {
  const product = await prisma.product.findFirstOrThrow({
    where: { slug },
    include: { optionGroups: { include: { options: true } } },
  });
  const optionIds = product.optionGroups
    .filter((group) => group.required)
    .flatMap((group) =>
      group.options.filter((option) => option.isDefault).map((option) => option.id),
    );
  return { productId: product.id, quantity, optionIds: [...optionIds, ...extraOptions] };
}

async function customer(profile: { username?: string | null; phone?: string | null } = {}) {
  return ctx.userWithToken({
    username: profile.username === undefined ? "cliente1" : profile.username,
    phone: profile.phone === undefined ? "+34 600 000 000" : profile.phone,
  });
}

async function address(userId: string, postalCode = "28001", isDefault = false) {
  return prisma.address.create({
    data: {
      userId,
      recipientName: "Cliente",
      line1: "Calle Mayor 1",
      postalCode,
      city: "Madrid",
      isDefault,
    },
  });
}

function post(headers: Record<string, string>, body: object, key = randomUUID()) {
  return api().post("/api/v1/orders").set(headers).set("Idempotency-Key", key).send(body);
}

describe("POST /checkout/quote", () => {
  it("is public and prices the cart on the server", async () => {
    const { status, body } = await api()
      .post("/api/v1/checkout/quote")
      .send({ items: [await line("margherita", 2)] });
    expect(status).toBe(200);
    expect(body.data.totals).toMatchObject({
      subtotal: "19.00",
      discount: "0.00",
      deliveryFee: "0.00",
      total: "19.00",
    });
    expect(body.data.lines[0]).toMatchObject({
      unitPrice: "9.50",
      lineTotal: "19.00",
      quantity: 2,
    });
    // IVA contenido: 19,00 al 10 % -> 1,73.
    expect(body.data.totals.tax).toBe("1.73");
    expect(body.data.estimatedMinutes).toBe(20);
    // Los puntos se estiman sobre los productos (sin envío) con la regla configurada.
    expect(body.data.pointsToEarn).toBeGreaterThan(0);
  });

  it("adds the price of the selected options", async () => {
    const extra = await prisma.productOption.findFirstOrThrow({
      where: {
        group: { product: { slug: "margherita" }, kind: "EXTRA_INGREDIENT" },
        priceDelta: { gt: 0 },
      },
    });
    const { body } = await api()
      .post("/api/v1/checkout/quote")
      .send({ items: [await line("margherita", 1, [extra.id])] });
    const expected = (9.5 + Number(extra.priceDelta)).toFixed(2);
    expect(body.data.lines[0].unitPrice).toBe(expected);
  });

  it("never accepts prices or totals sent by the client", async () => {
    for (const forbidden of [{ unitPrice: "0.01" }, { price: "0.01" }, { total: "0.01" }]) {
      const item = { ...(await line("margherita")), ...forbidden };
      const response = await api()
        .post("/api/v1/checkout/quote")
        .send({ items: [item] });
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    }
    const response = await api()
      .post("/api/v1/checkout/quote")
      .send({ items: [await line("margherita")], deliveryFee: "0.00" });
    expect(response.status).toBe(400);
  });

  it("charges the zone delivery fee and flags orders below the minimum", async () => {
    const { body } = await api()
      .post("/api/v1/checkout/quote")
      .send({ type: "DELIVERY", postalCode: "28001", items: [await line("margherita")] });
    expect(body.data.totals).toMatchObject({
      subtotal: "9.50",
      deliveryFee: "2.50",
      total: "12.00",
    });
    expect(body.data.delivery).toMatchObject({
      covered: true,
      minimumOrder: "12.00",
      belowMinimum: true,
    });

    const outside = await api()
      .post("/api/v1/checkout/quote")
      .send({ type: "DELIVERY", postalCode: "08001", items: [await line("margherita")] });
    expect(outside.body.data.delivery).toMatchObject({ covered: false });
    expect(outside.body.data.totals.deliveryFee).toBe("0.00");
  });

  it("does not charge delivery on pickup orders", async () => {
    const { body } = await api()
      .post("/api/v1/checkout/quote")
      .send({ type: "PICKUP", postalCode: "28001", items: [await line("margherita")] });
    expect(body.data.totals.deliveryFee).toBe("0.00");
    expect(body.data.delivery).toBeNull();
  });

  it("rejects invalid carts", async () => {
    const send = (items: unknown[]) => api().post("/api/v1/checkout/quote").send({ items });
    const valid = await line("margherita");

    expect((await send([])).status).toBe(400);
    expect((await send([{ ...valid, quantity: 0 }])).status).toBe(400);
    expect((await send([{ ...valid, quantity: 21 }])).status).toBe(400);
    expect((await send([{ ...valid, productId: "nope" }])).status).toBe(400);

    const unknown = await send([{ ...valid, productId: randomUUID() }]);
    expect(unknown.status).toBe(422);
    expect(unknown.body.error.code).toBe("PRODUCT_NOT_FOUND");

    // Falta la opción obligatoria (tamaño y masa).
    const missing = await send([{ ...valid, optionIds: [] }]);
    expect(missing.status).toBe(422);
    expect(missing.body.error.code).toBe("INVALID_OPTIONS");

    // Opción de otro producto.
    const other = await prisma.productOption.findFirstOrThrow({
      where: { group: { product: { slug: { not: "margherita" } } } },
    });
    const foreign = await send([{ ...valid, optionIds: [...valid.optionIds, other.id] }]);
    expect(foreign.body.error.code).toBe("INVALID_OPTIONS");

    // Opción repetida.
    const repeated = await send([
      { ...valid, optionIds: [...valid.optionIds, valid.optionIds[0]!] },
    ]);
    expect(repeated.body.error.code).toBe("INVALID_OPTIONS");
  });

  it("rejects unavailable products and options", async () => {
    await prisma.product.updateMany({ where: { slug: "margherita" }, data: { available: false } });
    const unavailable = await api()
      .post("/api/v1/checkout/quote")
      .send({ items: [await line("margherita")] });
    expect(unavailable.body.error.code).toBe("PRODUCT_UNAVAILABLE");

    await prisma.product.updateMany({ where: { slug: "margherita" }, data: { available: true } });
    const item = await line("margherita");
    await prisma.productOption.update({
      where: { id: item.optionIds[0]! },
      data: { available: false },
    });
    const option = await api()
      .post("/api/v1/checkout/quote")
      .send({ items: [item] });
    expect(option.body.error.code).toBe("OPTION_UNAVAILABLE");
  });
});

describe("saved cart", () => {
  it("requires authentication", async () => {
    expect((await api().get("/api/v1/cart")).status).toBe(401);
    expect((await api().put("/api/v1/cart").send({ items: [] })).status).toBe(401);
  });

  it("stores and returns what the user wants, without prices", async () => {
    const { headers } = await customer();
    const item = await line("margherita", 2);
    const saved = await api()
      .put("/api/v1/cart")
      .set(headers)
      .send({ items: [item] });
    expect(saved.status).toBe(200);
    expect(saved.body.data.items).toEqual([
      {
        productId: item.productId,
        quantity: 2,
        optionIds: [...item.optionIds].sort(),
        notes: null,
      },
    ]);
    expect((await api().get("/api/v1/cart").set(headers)).body.data.items).toHaveLength(1);

    const emptied = await api().put("/api/v1/cart").set(headers).send({ items: [] });
    expect(emptied.body.data.items).toEqual([]);
  });

  it("drops products that no longer exist and keeps carts private", async () => {
    const one = await customer();
    const two = await customer();
    const item = await line("margherita");
    const response = await api()
      .put("/api/v1/cart")
      .set(one.headers)
      .send({ items: [item, { productId: randomUUID(), quantity: 1, optionIds: [] }] });
    expect(response.body.data.items).toHaveLength(1);
    expect((await api().get("/api/v1/cart").set(two.headers)).body.data.items).toEqual([]);
  });
});

describe("POST /orders", () => {
  it("creates a pickup order priced by the server, with cash pending", async () => {
    const { user, headers } = await customer();
    await api()
      .put("/api/v1/cart")
      .set(headers)
      .send({ items: [await line("margherita", 2)] });

    const response = await post(headers, {
      items: [await line("margherita", 2)],
      type: "PICKUP",
      paymentMethod: "CASH_PICKUP",
      notes: "Sin albahaca",
    });
    expect(response.status).toBe(201);
    const order = response.body.data;
    expect(order).toMatchObject({
      status: "NEW",
      type: "PICKUP",
      notes: "Sin albahaca",
      totals: { subtotal: "19.00", deliveryFee: "0.00", total: "19.00", tax: "1.73" },
      payments: [{ method: "CASH_PICKUP", status: "CASH_PENDING", amount: "19.00" }],
    });
    expect(order.estimatedReadyAt).toBeTruthy();
    expect(order.history).toHaveLength(1);

    // Instantánea en la base de datos y carrito vaciado.
    const stored = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: { include: { options: true } }, statusHistory: true },
    });
    expect(stored.userId).toBe(user.id);
    expect(stored.customerPhone).toBe("+34 600 000 000");
    expect(stored.items[0]).toMatchObject({ productName: "Margherita", quantity: 2 });
    expect(stored.items[0]!.options.length).toBeGreaterThan(0);
    expect(stored.statusHistory[0]).toMatchObject({
      fromStatus: null,
      toStatus: "NEW",
      changedById: user.id,
    });
    expect((await api().get("/api/v1/cart").set(headers)).body.data.items).toEqual([]);
  });

  it("keeps historical orders unchanged when the menu changes", async () => {
    const { headers } = await customer();
    const response = await post(headers, {
      items: [await line("margherita")],
      type: "PICKUP",
      paymentMethod: "CASH_PICKUP",
    });
    await prisma.product.updateMany({
      where: { slug: "margherita" },
      data: { basePrice: "20.00", name: "Otra" },
    });
    const detail = await api().get(`/api/v1/orders/${response.body.data.id}`).set(headers);
    expect(detail.body.data.items[0]).toMatchObject({
      productName: "Margherita",
      unitPrice: "9.50",
    });
    expect(detail.body.data.totals.total).toBe("9.50");
  });

  it("creates a delivery order with the zone fee and a copy of the address", async () => {
    const { user, headers } = await customer();
    const saved = await address(user.id);
    const response = await post(headers, {
      items: [await line("margherita", 2)],
      type: "DELIVERY",
      addressId: saved.id,
      paymentMethod: "CASH_DELIVERY",
    });
    expect(response.status).toBe(201);
    expect(response.body.data.totals).toMatchObject({
      subtotal: "19.00",
      deliveryFee: "2.50",
      total: "21.50",
    });
    expect(response.body.data.delivery).toMatchObject({
      line1: "Calle Mayor 1",
      postalCode: "28001",
    });
    // Cambiar la dirección guardada después no altera el pedido.
    await prisma.address.update({ where: { id: saved.id }, data: { line1: "Otra calle 9" } });
    const detail = await api().get(`/api/v1/orders/${response.body.data.id}`).set(headers);
    expect(detail.body.data.delivery.line1).toBe("Calle Mayor 1");
  });

  it("rejects deliveries outside the zones, below the minimum or to someone else's address", async () => {
    const { user, headers } = await customer();
    const other = await customer();
    const body = (addressId: string, items: unknown[]) => ({
      items,
      type: "DELIVERY",
      addressId,
      paymentMethod: "CASH_DELIVERY",
    });

    const outside = await address(user.id, "08001");
    const r1 = await post(headers, body(outside.id, [await line("margherita", 2)]));
    expect(r1.status).toBe(422);
    expect(r1.body.error.code).toBe("OUTSIDE_DELIVERY_ZONE");

    const inside = await address(user.id, "28001");
    const r2 = await post(headers, body(inside.id, [await line("margherita")]));
    expect(r2.body.error).toMatchObject({
      code: "BELOW_MINIMUM_ORDER",
      details: { minimumOrder: "12.00" },
    });

    const foreign = await address(other.user.id);
    const r3 = await post(headers, body(foreign.id, [await line("margherita", 2)]));
    expect(r3.body.error.code).toBe("ADDRESS_NOT_FOUND");

    expect(await prisma.order.count()).toBe(0);
  });

  it("requires an address for deliveries and forbids one for pickups", async () => {
    const { user, headers } = await customer();
    const items = [await line("margherita", 2)];
    const noAddress = await post(headers, {
      items,
      type: "DELIVERY",
      paymentMethod: "CASH_DELIVERY",
    });
    expect(noAddress.status).toBe(400);
    const saved = await address(user.id);
    const extra = await post(headers, {
      items,
      type: "PICKUP",
      addressId: saved.id,
      paymentMethod: "CASH_PICKUP",
    });
    expect(extra.status).toBe(400);
  });

  it("does not accept online payment until a provider is integrated, nor mismatched cash methods", async () => {
    const { headers } = await customer();
    const items = [await line("margherita")];
    const online = await post(headers, { items, type: "PICKUP", paymentMethod: "ONLINE" });
    expect(online.status).toBe(409);
    expect(online.body.error.code).toBe("PAYMENT_METHOD_UNAVAILABLE");

    const mismatch = await post(headers, { items, type: "PICKUP", paymentMethod: "CASH_DELIVERY" });
    expect(mismatch.body.error.code).toBe("PAYMENT_METHOD_MISMATCH");

    await prisma.storeSettings.update({
      where: { id: 1 },
      data: { enabledPaymentMethods: ["CASH_DELIVERY"] },
    });
    const disabled = await post(headers, { items, type: "PICKUP", paymentMethod: "CASH_PICKUP" });
    expect(disabled.body.error.code).toBe("PAYMENT_METHOD_UNAVAILABLE");

    // Y el local no anuncia el pago online mientras no se pueda usar.
    const settings = await api().get("/api/v1/store/settings");
    expect(settings.body.data.enabledPaymentMethods).not.toContain("ONLINE");
  });

  it("requires a complete profile", async () => {
    for (const profile of [{ username: null }, { phone: null }]) {
      const { headers } = await customer(profile);
      const response = await post(headers, {
        items: [await line("margherita")],
        type: "PICKUP",
        paymentMethod: "CASH_PICKUP",
      });
      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe("PROFILE_INCOMPLETE");
    }
  });

  it("respects the pause, the disabled order types and the opening hours", async () => {
    const { headers } = await customer();
    const order = async () =>
      post(headers, {
        items: [await line("margherita")],
        type: "PICKUP",
        paymentMethod: "CASH_PICKUP",
      });

    await prisma.storeSettings.update({
      where: { id: 1 },
      data: { ordersPaused: true, pausedMessage: "Volvemos pronto" },
    });
    const paused = await order();
    expect(paused.status).toBe(409);
    expect(paused.body.error).toMatchObject({ code: "ORDERS_PAUSED", message: "Volvemos pronto" });

    await prisma.storeSettings.update({
      where: { id: 1 },
      data: { ordersPaused: false, pickupEnabled: false },
    });
    expect((await order()).body.error.code).toBe("ORDER_TYPE_UNAVAILABLE");

    await prisma.storeSettings.update({ where: { id: 1 }, data: { pickupEnabled: true } });
    await prisma.openingHours.deleteMany();
    const closed = await order();
    expect(closed.status).toBe(409);
    expect(closed.body.error.code).toBe("STORE_CLOSED");
    expect(await prisma.order.count()).toBe(0);
  });

  it("accepts only the slots the server offers", async () => {
    const { headers } = await customer();
    const items = [await line("margherita")];
    const slots = await api().get("/api/v1/store/slots?type=PICKUP");
    expect(slots.status).toBe(200);
    expect(slots.headers["cache-control"]).toBe("no-store");
    const [first] = slots.body.data.slots as string[];
    expect(first).toBeTruthy();

    const ok = await post(headers, {
      items,
      type: "PICKUP",
      paymentMethod: "CASH_PICKUP",
      scheduledFor: first,
    });
    expect(ok.status).toBe(201);
    expect(ok.body.data.scheduledFor).toBe(first);

    const past = await post(headers, {
      items,
      type: "PICKUP",
      paymentMethod: "CASH_PICKUP",
      scheduledFor: "2020-01-01T10:00:00.000Z",
    });
    expect(past.body.error.code).toBe("INVALID_SCHEDULE");

    const offGrid = new Date(new Date(first!).getTime() + 60_000).toISOString();
    const misaligned = await post(headers, {
      items,
      type: "PICKUP",
      paymentMethod: "CASH_PICKUP",
      scheduledFor: offGrid,
    });
    expect(misaligned.body.error.code).toBe("INVALID_SCHEDULE");
  });

  it("validates the slots query", async () => {
    expect((await api().get("/api/v1/store/slots?date=hoy")).status).toBe(400);
    expect((await api().get("/api/v1/store/slots?type=TELEPORT")).status).toBe(400);
    const far = await api().get("/api/v1/store/slots?date=2099-01-01");
    expect(far.body.data.slots).toEqual([]);
  });

  it("never lets a customer see or reuse another customer's cart or order", async () => {
    const one = await customer();
    const two = await customer();
    const created = await post(one.headers, {
      items: [await line("margherita")],
      type: "PICKUP",
      paymentMethod: "CASH_PICKUP",
    });
    expect(
      (await api().get(`/api/v1/orders/${created.body.data.id}`).set(two.headers)).status,
    ).toBe(404);
  });
});

describe("idempotency", () => {
  const body = async () => ({
    items: [await line("margherita")],
    type: "PICKUP",
    paymentMethod: "CASH_PICKUP",
  });

  it("requires a valid Idempotency-Key", async () => {
    const { headers } = await customer();
    const missing = await api()
      .post("/api/v1/orders")
      .set(headers)
      .send(await body());
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    const short = await api()
      .post("/api/v1/orders")
      .set(headers)
      .set("Idempotency-Key", "abc")
      .send(await body());
    expect(short.body.error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  it("returns the same order when the same request is repeated, creating it only once", async () => {
    const { headers } = await customer();
    const key = randomUUID();
    const payload = await body();
    const first = await post(headers, payload, key);
    const second = await post(headers, payload, key);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.data.id).toBe(first.body.data.id);
    expect(second.headers["idempotent-replayed"]).toBe("true");
    expect(first.headers["idempotent-replayed"]).toBeUndefined();
    expect(await prisma.order.count()).toBe(1);
  });

  it("creates a single order when the same request arrives twice at once", async () => {
    const { headers } = await customer();
    const key = randomUUID();
    const payload = await body();
    const results = await Promise.all([
      post(headers, payload, key),
      post(headers, payload, key),
      post(headers, payload, key),
    ]);

    const created = results.filter((result) => result.status === 201);
    expect(created.length).toBeGreaterThanOrEqual(1);
    // El resto, o ven la respuesta guardada o saben que sigue en curso: nunca crean otro pedido.
    for (const result of results.filter((item) => item.status !== 201)) {
      expect(result.status).toBe(409);
      expect(result.body.error.code).toBe("REQUEST_IN_PROGRESS");
    }
    expect(await prisma.order.count()).toBe(1);
  });

  it("rejects the same key with a different request", async () => {
    const { headers } = await customer();
    const key = randomUUID();
    await post(headers, await body(), key);
    const other = { ...(await body()), notes: "Distinto" };
    const reused = await post(headers, other, key);
    expect(reused.status).toBe(422);
    expect(reused.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(await prisma.order.count()).toBe(1);
  });

  it("scopes keys per user and lets a failed request be retried with the same key", async () => {
    const one = await customer();
    const two = await customer();
    const key = randomUUID();
    const payload = await body();

    // Una petición fallida no «gasta» la clave: tras corregirla se puede reintentar.
    const failed = await post(one.headers, { ...payload, paymentMethod: "ONLINE" }, key);
    expect(failed.status).toBe(409);
    const retried = await post(one.headers, payload, key);
    expect(retried.status).toBe(201);

    // La misma clave de otro usuario es independiente.
    const other = await post(two.headers, payload, key);
    expect(other.status).toBe(201);
    expect(other.body.data.id).not.toBe(retried.body.data.id);
    expect(await prisma.order.count()).toBe(2);
  });
});

describe("contract", () => {
  it("quote, cart, slots and created orders match the documented schemas", async () => {
    const { user, headers } = await customer();
    const saved = await address(user.id);
    const items = [await line("margherita", 2)];

    data(Quote).parse((await api().post("/api/v1/checkout/quote").send({ items })).body);
    data(Quote).parse(
      (
        await api()
          .post("/api/v1/checkout/quote")
          .send({ items, type: "DELIVERY", postalCode: "28001" })
      ).body,
    );
    data(Cart).parse((await api().put("/api/v1/cart").set(headers).send({ items })).body);
    data(StoreSlots).parse((await api().get("/api/v1/store/slots?type=DELIVERY")).body);

    const created = await post(headers, {
      items,
      type: "DELIVERY",
      addressId: saved.id,
      paymentMethod: "CASH_DELIVERY",
    });
    expect(created.status).toBe(201);
    data(Order).parse(created.body);
    data(StoreSettings).parse((await api().get("/api/v1/store/settings")).body);

    for (const failure of [
      await api().post("/api/v1/checkout/quote").send({ items: [] }),
      await post(headers, { items, type: "PICKUP", paymentMethod: "ONLINE" }),
    ]) {
      ErrorResponse.parse(failure.body);
    }
  });
});
