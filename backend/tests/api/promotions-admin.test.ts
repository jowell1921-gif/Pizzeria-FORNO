import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { seedDemoData } from "../../prisma/seed-demo-data.js";
import { changeOrderStatus } from "../../src/modules/orders/status.service.js";
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

type Role = "ADMIN" | "STAFF" | "KITCHEN";
async function withRole(role: Role) {
  const current = await ctx.userWithToken({ username: `u_${role}`, phone: "+34 600 000 001" });
  await prisma.userRole.create({ data: { userId: current.user.id, role } });
  return current;
}
const customer = () => ctx.userWithToken({ username: "cliente1", phone: "+34 600 000 002" });

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

const quote = (headers: Record<string, string> | null, body: object) => {
  const req = api().post("/api/v1/checkout/quote");
  if (headers) req.set(headers);
  return req.send({ type: "PICKUP", ...body });
};
const order = (headers: Record<string, string>, body: object) =>
  api()
    .post("/api/v1/orders")
    .set(headers)
    .set("Idempotency-Key", randomUUID())
    .send({ type: "PICKUP", paymentMethod: "CASH_PICKUP", ...body });

const promo = (changes: Record<string, unknown> = {}) => ({
  name: "Fin de semana",
  description: "15 % en pedidos grandes",
  kind: "DISCOUNT",
  discountType: "PERCENT",
  discountValue: "15.00",
  ...changes,
});

describe("access control", () => {
  it("promotions need promotions:manage, FORNO CLUB needs loyalty:manage, customers need customers:read", async () => {
    const admin = await withRole("ADMIN");
    const staff = await withRole("STAFF");
    const kitchen = await withRole("KITCHEN");
    const guarded = [
      "/api/v1/admin/promotions",
      "/api/v1/admin/rewards",
      "/api/v1/admin/loyalty/settings",
      "/api/v1/admin/loyalty/transactions",
      "/api/v1/admin/loyalty/redemptions",
    ];
    for (const path of guarded) {
      expect((await api().get(path)).status, path).toBe(401);
      expect((await api().get(path).set(staff.headers)).status, `STAFF ${path}`).toBe(403);
      expect((await api().get(path).set(kitchen.headers)).status, `KITCHEN ${path}`).toBe(403);
      expect((await api().get(path).set(admin.headers)).status, `ADMIN ${path}`).toBe(200);
    }
    // El personal sí puede consultar clientes; la cocina y los clientes no.
    expect((await api().get("/api/v1/admin/customers").set(staff.headers)).status).toBe(200);
    expect((await api().get("/api/v1/admin/customers").set(kitchen.headers)).status).toBe(403);
    expect(
      (
        await api()
          .get("/api/v1/admin/customers")
          .set((await customer()).headers)
      ).status,
    ).toBe(403);
    // Pero el personal no ajusta puntos.
    expect(
      (
        await api()
          .post("/api/v1/admin/loyalty/adjustments")
          .set(staff.headers)
          .send({ userId: randomUUID(), points: 5, reason: "Prueba" })
      ).status,
    ).toBe(403);
  });
});

describe("promotions", () => {
  it("lists the demo promotions with usage and coupons", async () => {
    const { headers } = await withRole("ADMIN");
    const list = (await api().get("/api/v1/admin/promotions").set(headers)).body.data;
    expect(list).toHaveLength(3);
    const welcome = list.find((item: { name: string }) => item.name.startsWith("10 %"));
    expect(welcome).toMatchObject({
      kind: "DISCOUNT",
      discountType: "PERCENT",
      discountValue: "10.00",
      automatic: false,
      usage: 0,
    });
    expect(welcome.coupons[0]).toMatchObject({ code: "BIENVENIDO10", usage: 0, active: true });
  });

  it("creates a promotion with a coupon that customers can use right away", async () => {
    const { user, headers } = await withRole("ADMIN");
    const created = await api()
      .post("/api/v1/admin/promotions")
      .set(headers)
      .send(promo({ badge: "Finde", conditions: ["Solo fines de semana"] }));
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      name: "Fin de semana",
      automatic: false,
      active: true,
      badge: "Finde",
      usage: 0,
    });

    const coupon = await api()
      .post(`/api/v1/admin/promotions/${created.body.data.id}/coupons`)
      .set(headers)
      .send({ code: " finde15 ", maxRedemptions: 50 });
    expect(coupon.status).toBe(201);
    expect(coupon.body.data.coupons[0]).toMatchObject({ code: "FINDE15", maxRedemptions: 50 });

    const buyer = await customer();
    const priced = await quote(buyer.headers, {
      items: [await line("margherita", 2)],
      couponCode: "finde15",
    });
    expect(priced.body.data.discounts[0]).toMatchObject({ amount: "2.85" }); // 15 % de 19,00
    expect(
      (await api().get("/api/v1/promotions")).body.data.map(
        (item: { code: string | null }) => item.code,
      ),
    ).toContain("FINDE15");
    expect(
      (await prisma.auditLog.findFirstOrThrow({ where: { action: "promotion.create" } })).actorId,
    ).toBe(user.id);
    expect(await prisma.auditLog.count({ where: { action: "coupon.create" } })).toBe(1);
  });

  it("validates the promotion rules", async () => {
    const { headers } = await withRole("ADMIN");
    const post = (changes: Record<string, unknown>) =>
      api().post("/api/v1/admin/promotions").set(headers).send(promo(changes));
    const pizza = await prisma.product.findFirstOrThrow({ where: { slug: "margherita" } });
    for (const changes of [
      { discountType: null, discountValue: null },
      { discountValue: "0.00" },
      { discountValue: "150.00" },
      { discountValue: "abc" },
      { startsAt: "2030-02-01T00:00:00.000Z", endsAt: "2030-01-01T00:00:00.000Z" },
      { kind: "COMBO", comboPrice: "9.00", products: [] },
      { kind: "COMBO", comboPrice: null, products: [{ productId: pizza.id }] },
      { maxRedemptions: 0 },
      { name: "x" },
      { slug: "forzado" },
      { products: [{ productId: "no-uuid" }] },
    ]) {
      expect((await post(changes)).status, JSON.stringify(changes)).toBe(400);
    }
    const unknown = await post({ products: [{ productId: randomUUID() }] });
    expect(unknown.status).toBe(422);
    expect(unknown.body.error.code).toBe("PRODUCT_NOT_FOUND");
    expect((await post({ discountType: "FIXED", discountValue: "5.00" })).status).toBe(201);
  });

  it("edits a promotion keeping the rest, and rejects edits that would leave it invalid", async () => {
    const { headers } = await withRole("ADMIN");
    const created = (
      await api()
        .post("/api/v1/admin/promotions")
        .set(headers)
        .send(promo({ conditions: ["Una"], maxRedemptions: 10 }))
    ).body.data;

    const edited = await api()
      .patch(`/api/v1/admin/promotions/${created.id}`)
      .set(headers)
      .send({ discountValue: "20.00", active: false });
    expect(edited.status).toBe(200);
    expect(edited.body.data).toMatchObject({
      discountValue: "20.00",
      active: false,
      name: "Fin de semana",
      maxRedemptions: 10,
      conditions: ["Una"],
    });
    expect(
      (await api().get("/api/v1/promotions")).body.data.map((item: { name: string }) => item.name),
    ).not.toContain("Fin de semana");

    // Pasar a combo sin precio ni productos deja la promoción inválida.
    expect(
      (
        await api()
          .patch(`/api/v1/admin/promotions/${created.id}`)
          .set(headers)
          .send({ kind: "COMBO" })
      ).status,
    ).toBe(400);
    expect(
      (await api().patch(`/api/v1/admin/promotions/${created.id}`).set(headers).send({})).status,
    ).toBe(400);
    expect(
      (
        await api()
          .patch(`/api/v1/admin/promotions/${randomUUID()}`)
          .set(headers)
          .send({ active: true })
      ).status,
    ).toBe(404);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "promotion.update" } });
    expect(audit.after).toMatchObject({ active: false, changed: ["discountValue", "active"] });
  });

  it("applies an automatic promotion without a code, and a typed coupon takes precedence", async () => {
    const { headers } = await withRole("ADMIN");
    await api()
      .post("/api/v1/admin/promotions")
      .set(headers)
      .send(promo({ automatic: true, minSubtotal: "20.00", name: "Menú grande" }));
    const buyer = await customer();

    // Por debajo del mínimo no se aplica; por encima, sí, también sin sesión.
    expect((await quote(null, { items: [await line("margherita")] })).body.data.discounts).toEqual(
      [],
    );
    const anonymous = await quote(null, { items: [await line("margherita", 3)] }); // 28,50
    expect(anonymous.body.data.discounts).toEqual([{ description: "Menú grande", amount: "4.28" }]); // 15 % de 28,50 = 4,275 -> 4,28
    expect(anonymous.body.data.totals.total).toBe("24.22");

    // Un cupón escrito por el cliente sustituye a la promoción automática.
    const withCoupon = await quote(buyer.headers, {
      items: [await line("margherita", 3)],
      couponCode: "BIENVENIDO10",
    });
    expect(withCoupon.body.data.discounts).toHaveLength(1);
    expect(withCoupon.body.data.discounts[0].description).toContain("BIENVENIDO10");

    // En el pedido se guarda el descuento con su promoción.
    const placed = await order(buyer.headers, { items: [await line("margherita", 3)] });
    expect(placed.status).toBe(201);
    expect(placed.body.data.totals).toMatchObject({ discount: "4.28", total: "24.22" });
    const stored = await prisma.orderDiscount.findFirstOrThrow({
      where: { orderId: placed.body.data.id },
    });
    expect(stored.promotionId).not.toBeNull();
    expect(stored.couponId).toBeNull();
  });

  it("respects first-order and per-customer limits of automatic promotions, and releases them on cancellation", async () => {
    const { headers } = await withRole("ADMIN");
    await api()
      .post("/api/v1/admin/promotions")
      .set(headers)
      .send(promo({ automatic: true, firstOrderOnly: true, name: "Primera vez" }));
    const buyer = await customer();
    const items = [await line("margherita", 2)];

    expect((await quote(null, { items })).body.data.discounts).toEqual([]); // anónimo: depende del cliente
    expect((await quote(buyer.headers, { items })).body.data.discounts).toHaveLength(1);
    const first = await order(buyer.headers, { items });
    expect(first.body.data.discounts).toHaveLength(1);
    expect((await quote(buyer.headers, { items })).body.data.discounts).toEqual([]);
    expect((await order(buyer.headers, { items })).body.data.discounts).toEqual([]);

    // Cancelar el primer pedido libera la promoción... pero el segundo ya cuenta como pedido previo.
    await api().post(`/api/v1/orders/${first.body.data.id}/cancel`).set(buyer.headers);
    const other = await customer();
    expect((await quote(other.headers, { items })).body.data.discounts).toHaveLength(1);
  });

  it("a limited automatic promotion cannot be spent twice by simultaneous orders", async () => {
    const { headers } = await withRole("ADMIN");
    await api()
      .post("/api/v1/admin/promotions")
      .set(headers)
      .send(promo({ automatic: true, maxRedemptions: 1, name: "Solo uno" }));
    const buyers = await Promise.all([customer(), customer(), customer(), customer()]);
    const items = [await line("margherita", 2)];
    const results = await Promise.all(buyers.map((buyer) => order(buyer.headers, { items })));

    const created = results.filter((result) => result.status === 201);
    expect(created).toHaveLength(1);
    for (const failed of results.filter((result) => result.status !== 201)) {
      expect(failed.body.error.code).toBe("PROMOTION_CHANGED");
    }
    expect(await prisma.orderDiscount.count({ where: { description: "Solo uno" } })).toBe(1);
  });

  it("applies a combo price and deletes a promotion softly, deactivating its coupons", async () => {
    const { headers } = await withRole("ADMIN");
    const pizza = await prisma.product.findFirstOrThrow({ where: { slug: "margherita" } });
    const drink = await prisma.product.findFirstOrThrow({ where: { slug: "agua" } });
    const combo = await api()
      .post("/api/v1/admin/promotions")
      .set(headers)
      .send({
        name: "Pizza y agua",
        description: "Combo",
        kind: "COMBO",
        comboPrice: "10.50",
        automatic: true,
        products: [{ productId: pizza.id }, { productId: drink.id }],
      });
    expect(combo.status).toBe(201);
    expect(
      combo.body.data.products.map((item: { productName: string }) => item.productName).sort(),
    ).toEqual(["Agua mineral", "Margherita"]);
    const priced = await quote(null, { items: [await line("margherita"), await line("agua")] });
    expect(priced.body.data.discounts[0].amount).toBe("1.00"); // 11,50 -> 10,50

    const coupon = await api()
      .post(`/api/v1/admin/promotions/${combo.body.data.id}/coupons`)
      .set(headers)
      .send({ code: "COMBOYA" });
    expect(coupon.status).toBe(201);
    expect(
      (await api().delete(`/api/v1/admin/promotions/${combo.body.data.id}`).set(headers)).status,
    ).toBe(204);
    expect(
      (await quote(null, { items: [await line("margherita"), await line("agua")] })).body.data
        .discounts,
    ).toEqual([]);
    expect((await prisma.coupon.findUniqueOrThrow({ where: { code: "COMBOYA" } })).active).toBe(
      false,
    );
    expect((await api().get("/api/v1/admin/promotions").set(headers)).body.data).toHaveLength(3);
    expect(
      (await api().get(`/api/v1/admin/promotions/${combo.body.data.id}`).set(headers)).status,
    ).toBe(404);
  });
});

describe("coupons", () => {
  it("rejects duplicate codes, invalid data and unknown customers", async () => {
    const { headers } = await withRole("ADMIN");
    const welcome = await prisma.promotion.findFirstOrThrow({
      where: { name: { startsWith: "10 %" } },
    });
    const post = (body: object) =>
      api().post(`/api/v1/admin/promotions/${welcome.id}/coupons`).set(headers).send(body);

    expect((await post({ code: "bienvenido10" })).status).toBe(409);
    for (const body of [
      { code: "no" },
      { code: "tiene espacios" },
      { code: "OK1", extra: true },
      { code: "OK2", maxRedemptions: 0 },
      { code: "OK3", startsAt: "2030-02-01T00:00:00.000Z", endsAt: "2030-01-01T00:00:00.000Z" },
    ]) {
      expect((await post(body)).status, JSON.stringify(body)).toBe(400);
    }
    expect((await post({ code: "PERSONAL1", userId: randomUUID() })).body.error.code).toBe(
      "CUSTOMER_NOT_FOUND",
    );
    expect(
      (
        await api()
          .post(`/api/v1/admin/promotions/${randomUUID()}/coupons`)
          .set(headers)
          .send({ code: "ABC" })
      ).status,
    ).toBe(404);
  });

  it("creates personal coupons, deactivates them and refuses to delete a used one", async () => {
    const { headers } = await withRole("ADMIN");
    const owner = await customer();
    const other = await customer();
    const welcome = await prisma.promotion.findFirstOrThrow({
      where: { name: { startsWith: "10 %" } },
    });
    const created = await api()
      .post(`/api/v1/admin/promotions/${welcome.id}/coupons`)
      .set(headers)
      .send({ code: "SOLOTU", userId: owner.user.id });
    const couponId = created.body.data.coupons.find(
      (item: { code: string }) => item.code === "SOLOTU",
    ).id;
    const items = [await line("margherita", 2)];

    expect((await quote(owner.headers, { items, couponCode: "SOLOTU" })).status).toBe(200);
    expect((await quote(other.headers, { items, couponCode: "SOLOTU" })).body.error.code).toBe(
      "COUPON_NOT_FOUND",
    );

    await api().patch(`/api/v1/admin/coupons/${couponId}`).set(headers).send({ active: false });
    expect((await quote(owner.headers, { items, couponCode: "SOLOTU" })).body.error.code).toBe(
      "COUPON_INACTIVE",
    );
    await api().patch(`/api/v1/admin/coupons/${couponId}`).set(headers).send({ active: true });

    expect((await order(owner.headers, { items, couponCode: "SOLOTU" })).status).toBe(201);
    const used = await api().delete(`/api/v1/admin/coupons/${couponId}`).set(headers);
    expect(used.status).toBe(409);
    expect(used.body.error.code).toBe("COUPON_HAS_USES");
    const usage = (
      await api().get(`/api/v1/admin/promotions/${welcome.id}`).set(headers)
    ).body.data.coupons.find((item: { code: string }) => item.code === "SOLOTU");
    expect(usage.usage).toBe(1);

    const spare = await api()
      .post(`/api/v1/admin/promotions/${welcome.id}/coupons`)
      .set(headers)
      .send({ code: "SOBRANTE" });
    const spareId = spare.body.data.coupons.find(
      (item: { code: string }) => item.code === "SOBRANTE",
    ).id;
    expect((await api().delete(`/api/v1/admin/coupons/${spareId}`).set(headers)).status).toBe(204);
    expect((await api().delete(`/api/v1/admin/coupons/${spareId}`).set(headers)).status).toBe(404);
    expect(
      (await api().patch(`/api/v1/admin/coupons/${couponId}`).set(headers).send({ code: "OTRO" }))
        .status,
    ).toBe(400);
  });

  it("keeps points rules right: a completed order with a discount earns points on what was paid", async () => {
    const { user: staff } = await withRole("STAFF");
    const buyer = await customer();
    const placed = await order(buyer.headers, {
      items: [await line("margherita", 2)],
      couponCode: "BIENVENIDO10",
    });
    for (const to of ["ACCEPTED", "PREPARING", "READY", "COMPLETED"] as const) {
      await changeOrderStatus(prisma, { orderId: placed.body.data.id, to, actorId: staff.id });
    }
    expect((await api().get("/api/v1/loyalty/account").set(buyer.headers)).body.data.balance).toBe(
      17,
    );
  });
});

describe("partial edits never reset what was not sent", () => {
  it("keeps products, flags and conditions of a promotion when only one field changes", async () => {
    const { headers } = await withRole("ADMIN");
    const pizza = await prisma.product.findFirstOrThrow({ where: { slug: "margherita" } });
    const created = (
      await api()
        .post("/api/v1/admin/promotions")
        .set(headers)
        .send(
          promo({
            automatic: true,
            firstOrderOnly: true,
            conditions: ["A", "B"],
            products: [{ productId: pizza.id, quantity: 2 }],
          }),
        )
    ).body.data;
    const edited = (
      await api()
        .patch(`/api/v1/admin/promotions/${created.id}`)
        .set(headers)
        .send({ badge: "Nuevo" })
    ).body.data;
    expect(edited).toMatchObject({
      badge: "Nuevo",
      automatic: true,
      firstOrderOnly: true,
      active: true,
      conditions: ["A", "B"],
    });
    expect(edited.products).toEqual([
      { productId: pizza.id, productName: "Margherita", quantity: 2 },
    ]);
  });
});
