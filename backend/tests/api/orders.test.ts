import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  buildOrder,
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

describe("customers only see their own orders (critical case 1)", () => {
  async function twoCustomers() {
    const product = await createProduct(prisma);
    const ana = await ctx.userWithToken();
    const luis = await ctx.userWithToken();
    const anaOrder = await createOrder(prisma, { userId: ana.user.id, productId: product.id });
    const luisOrder = await createOrder(prisma, {
      userId: luis.user.id,
      productId: product.id,
      type: "DELIVERY",
    });
    return { product, ana, luis, anaOrder, luisOrder };
  }

  it("requires authentication", async () => {
    const { anaOrder } = await twoCustomers();
    expect((await request(ctx.app).get("/api/v1/orders/me")).status).toBe(401);
    expect((await request(ctx.app).get(`/api/v1/orders/${anaOrder.id}`)).status).toBe(401);
  });

  it("lists only the orders of the signed-in customer", async () => {
    const { ana, luis, anaOrder, luisOrder } = await twoCustomers();

    const anaList = await request(ctx.app).get("/api/v1/orders/me").set(ana.headers);
    expect(anaList.body.data.map((order: { id: string }) => order.id)).toEqual([anaOrder.id]);

    const luisList = await request(ctx.app).get("/api/v1/orders/me").set(luis.headers);
    expect(luisList.body.data.map((order: { id: string }) => order.id)).toEqual([luisOrder.id]);
  });

  it("answers 404 (not 403) when asking for another customer's order, so it does not reveal that it exists", async () => {
    const { ana, luisOrder } = await twoCustomers();

    const other = await request(ctx.app).get(`/api/v1/orders/${luisOrder.id}`).set(ana.headers);
    expect(other.status).toBe(404);

    const missing = await request(ctx.app).get(`/api/v1/orders/${randomUUID()}`).set(ana.headers);
    expect(missing.status).toBe(404);
    // Misma respuesta que para un pedido que no existe.
    expect(other.body.error.code).toBe(missing.body.error.code);
    expect(other.body.error.message).toBe(missing.body.error.message);
  });

  it("does not let a client choose whose orders to list", async () => {
    const { ana, luis } = await twoCustomers();
    const response = await request(ctx.app)
      .get("/api/v1/orders/me")
      .query({ userId: luis.user.id })
      .set({ ...ana.headers, "X-User-Id": luis.user.id });
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).not.toBeUndefined();
    const own = await prisma.order.findFirstOrThrow({ where: { userId: ana.user.id } });
    expect(response.body.data[0].id).toBe(own.id);
  });

  it("rejects malformed order ids with a 404", async () => {
    const { ana } = await twoCustomers();
    for (const id of ["abc", "1", "../../etc/passwd", '\'; DROP TABLE "Order";--']) {
      const response = await request(ctx.app)
        .get(`/api/v1/orders/${encodeURIComponent(id)}`)
        .set(ana.headers);
      expect(response.status, id).toBe(404);
    }
    expect(await prisma.order.count()).toBe(2);
  });
});

describe("order data", () => {
  it("lists newest first with money as decimal strings and the item count", async () => {
    const product = await createProduct(prisma);
    const { user, headers } = await ctx.userWithToken();
    await createOrder(prisma, {
      userId: user.id,
      productId: product.id,
      quantity: 2,
      unitPrice: "9.50",
    });
    await createOrder(prisma, {
      userId: user.id,
      productId: product.id,
      quantity: 3,
      unitPrice: "11.00",
    });

    const response = await request(ctx.app).get("/api/v1/orders/me").set(headers);
    expect(response.body.meta).toMatchObject({ page: 1, total: 2 });
    expect(response.body.data[0]).toMatchObject({
      total: "33.00",
      itemCount: 3,
      type: "PICKUP",
      status: "NEW",
    });
    expect(response.body.data[1]).toMatchObject({ total: "19.00", itemCount: 2 });
    expect(response.body.data[0].orderNumber).toBeGreaterThan(response.body.data[1].orderNumber);
  });

  it("paginates", async () => {
    const product = await createProduct(prisma);
    const { user, headers } = await ctx.userWithToken();
    for (let i = 0; i < 5; i += 1)
      await createOrder(prisma, { userId: user.id, productId: product.id });

    const page = await request(ctx.app)
      .get("/api/v1/orders/me")
      .query({ page: 3, pageSize: 2 })
      .set(headers);
    expect(page.body.data).toHaveLength(1);
    expect(page.body.meta).toEqual({ page: 3, pageSize: 2, total: 5, totalPages: 3 });
  });

  it("shows the detail with lines, options, totals, payments and history, and no staff data", async () => {
    const product = await createProduct(prisma);
    const { user, headers } = await ctx.userWithToken();
    const order = await prisma.order.create({
      data: {
        ...buildOrder({
          userId: user.id,
          productId: product.id,
          type: "DELIVERY",
          quantity: 2,
          unitPrice: "10.00",
        }),
        notes: "Sin cebolla",
      },
      include: { items: true },
    });
    await prisma.orderItemOption.create({
      data: {
        orderItemId: order.items[0]!.id,
        groupName: "Tamaño",
        optionName: "Familiar",
        priceDelta: "4.00",
      },
    });
    await prisma.payment.create({
      data: {
        orderId: order.id,
        method: "CASH_DELIVERY",
        status: "CASH_PENDING",
        amount: order.total,
      },
    });
    await prisma.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: null,
        toStatus: "NEW",
        changedById: user.id,
        reason: "nota interna",
      },
    });

    const response = await request(ctx.app).get(`/api/v1/orders/${order.id}`).set(headers);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      id: order.id,
      type: "DELIVERY",
      notes: "Sin cebolla",
      delivery: { line1: "Calle Ejemplo 1", postalCode: "28001", city: "Madrid" },
      items: [
        {
          productName: "Producto de prueba",
          quantity: 2,
          unitPrice: "10.00",
          lineTotal: "20.00",
          options: [{ group: "Tamaño", name: "Familiar", priceDelta: "4.00" }],
        },
      ],
      totals: { subtotal: "20.00", deliveryFee: "2.50", total: "22.50" },
      payments: [{ method: "CASH_DELIVERY", status: "CASH_PENDING", amount: "22.50" }],
      history: [{ status: "NEW" }],
    });
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain("nota interna");
    expect(serialized).not.toContain(user.id);
  });

  it("does not show a delivery address for pickup orders", async () => {
    const product = await createProduct(prisma);
    const { user, headers } = await ctx.userWithToken();
    const order = await createOrder(prisma, { userId: user.id, productId: product.id });
    const response = await request(ctx.app).get(`/api/v1/orders/${order.id}`).set(headers);
    expect(response.body.data.delivery).toBeNull();
  });
});
