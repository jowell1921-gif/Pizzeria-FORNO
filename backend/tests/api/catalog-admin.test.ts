import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

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
});

const api = () => request(ctx.app);

async function withRole(role: "ADMIN" | "STAFF" | "KITCHEN") {
  const current = await ctx.userWithToken({ username: `u_${role}`, phone: "+34 600 000 001" });
  await prisma.userRole.create({ data: { userId: current.user.id, role } });
  return current;
}

const categoryId = async (slug: string) =>
  (await prisma.category.findFirstOrThrow({ where: { slug } })).id;

const validProduct = async (overrides: Record<string, unknown> = {}) => ({
  categoryId: await categoryId("pizzas"),
  name: "Pizza Cuatro Estaciones",
  description: "Alcachofa, jamón, champiñón y aceitunas.",
  basePrice: "12.50",
  ingredients: ["Tomate", "Mozzarella", "Alcachofa"],
  allergens: ["gluten", "lacteos"],
  image: { url: "/image/pizza-diavola.webp", alt: "" },
  optionGroups: [
    {
      name: "Tamaño",
      kind: "SIZE",
      required: true,
      minSelect: 1,
      maxSelect: 1,
      options: [
        { name: "Mediana", priceDelta: "0.00", isDefault: true },
        { name: "Familiar", priceDelta: "4.00" },
      ],
    },
  ],
  ...overrides,
});

describe("access control", () => {
  it("requires catalog:manage: only admins can manage the menu", async () => {
    const paths = ["/api/v1/admin/products", "/api/v1/admin/categories", "/api/v1/admin/allergens"];
    for (const path of paths) expect((await api().get(path)).status, path).toBe(401);
    for (const role of ["STAFF", "KITCHEN"] as const) {
      const { headers } = await withRole(role);
      for (const path of paths)
        expect((await api().get(path).set(headers)).status, `${role} ${path}`).toBe(403);
      expect(
        (
          await api()
            .post("/api/v1/admin/products")
            .set(headers)
            .send(await validProduct())
        ).status,
      ).toBe(403);
    }
    const customer = await ctx.userWithToken();
    expect((await api().get(paths[0]!).set(customer.headers)).status).toBe(403);
    const admin = await withRole("ADMIN");
    for (const path of paths)
      expect((await api().get(path).set(admin.headers)).status, path).toBe(200);
  });
});

describe("categories", () => {
  it("creates, lists with product counts, updates and deletes (only when empty)", async () => {
    const { user, headers } = await withRole("ADMIN");
    const created = await api()
      .post("/api/v1/admin/categories")
      .set(headers)
      .send({ name: "Ensaladas", description: "Frescas" });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      slug: "ensaladas",
      name: "Ensaladas",
      active: true,
      productCount: 0,
    });

    const list = await api().get("/api/v1/admin/categories").set(headers);
    expect(
      list.body.data.find((item: { slug: string }) => item.slug === "pizzas").productCount,
    ).toBe(6);

    const patched = await api()
      .patch(`/api/v1/admin/categories/${created.body.data.id}`)
      .set(headers)
      .send({ active: false, name: "Ensaladas y bowls" });
    expect(patched.body.data).toMatchObject({ name: "Ensaladas y bowls", active: false });
    // Inactiva: no aparece en la carta pública.
    expect(
      (await api().get("/api/v1/categories")).body.data.map((item: { slug: string }) => item.slug),
    ).not.toContain("ensaladas");

    const pizzas = await categoryId("pizzas");
    const blocked = await api().delete(`/api/v1/admin/categories/${pizzas}`).set(headers);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("CATEGORY_HAS_PRODUCTS");

    expect(
      (await api().delete(`/api/v1/admin/categories/${created.body.data.id}`).set(headers)).status,
    ).toBe(204);
    expect(
      (await api().get("/api/v1/admin/categories").set(headers)).body.data.map(
        (item: { slug: string }) => item.slug,
      ),
    ).not.toContain("ensaladas");

    const actions = (await prisma.auditLog.findMany({ where: { entityType: "Category" } })).map(
      (entry) => entry.action,
    );
    expect(actions).toEqual(["category.create", "category.update", "category.delete"]);
    expect(
      (await prisma.auditLog.findFirstOrThrow({ where: { action: "category.create" } })).actorId,
    ).toBe(user.id);
  });

  it("rejects invalid data and unknown fields", async () => {
    const { headers } = await withRole("ADMIN");
    for (const body of [
      { name: "x" },
      { name: "Bien", slug: "mal" },
      { name: "Bien", sortOrder: -1 },
    ]) {
      expect((await api().post("/api/v1/admin/categories").set(headers).send(body)).status).toBe(
        400,
      );
    }
    expect(
      (
        await api()
          .patch(`/api/v1/admin/categories/${randomUUID()}`)
          .set(headers)
          .send({ name: "Nada" })
      ).status,
    ).toBe(404);
    expect(
      (await api().patch("/api/v1/admin/categories/no-uuid").set(headers).send({ name: "Nada" }))
        .status,
    ).toBe(404);
  });
});

describe("products", () => {
  it("creates a product with ingredients, allergens, options and image, and the public menu shows it", async () => {
    const { headers } = await withRole("ADMIN");
    const created = await api()
      .post("/api/v1/admin/products")
      .set(headers)
      .send(await validProduct());
    expect(created.status).toBe(201);
    const product = created.body.data;
    expect(product).toMatchObject({
      slug: "pizza-cuatro-estaciones",
      basePrice: "12.50",
      taxRate: "10.00",
      available: true,
      image: { url: "/image/pizza-diavola.webp" },
      ingredients: ["Tomate", "Mozzarella", "Alcachofa"],
      allergens: ["gluten", "lacteos"],
    });
    expect(product.optionGroups[0].options.map((option: { name: string }) => option.name)).toEqual([
      "Mediana",
      "Familiar",
    ]);

    const publicView = await api().get("/api/v1/products/pizza-cuatro-estaciones");
    expect(publicView.status).toBe(200);
    expect(publicView.body.data).toMatchObject({ price: "12.50", categorySlug: "pizzas" });
    expect(publicView.body.data.allergens.map((a: { code: string }) => a.code)).toEqual([
      "gluten",
      "lacteos",
    ]);

    const quote = await api()
      .post("/api/v1/checkout/quote")
      .send({
        items: [
          {
            productId: product.id,
            quantity: 1,
            optionIds: [product.optionGroups[0].options[1].id],
          },
        ],
      });
    expect(quote.body.data.totals.total).toBe("16.50"); // 12,50 + 4,00
  });

  it("gives a unique slug to products with the same name", async () => {
    const { headers } = await withRole("ADMIN");
    const first = await api()
      .post("/api/v1/admin/products")
      .set(headers)
      .send(await validProduct({ optionGroups: undefined }));
    const second = await api()
      .post("/api/v1/admin/products")
      .set(headers)
      .send(await validProduct({ optionGroups: undefined }));
    expect([first.body.data.slug, second.body.data.slug]).toEqual([
      "pizza-cuatro-estaciones",
      "pizza-cuatro-estaciones-2",
    ]);
  });

  it("validates prices, category, allergens, image URLs and unknown fields", async () => {
    const { headers } = await withRole("ADMIN");
    const post = async (overrides: Record<string, unknown>) =>
      api()
        .post("/api/v1/admin/products")
        .set(headers)
        .send(await validProduct(overrides));

    for (const basePrice of ["abc", "-1.00", "9.999", "1e3", ""]) {
      expect((await post({ basePrice })).status, basePrice).toBe(400);
    }
    expect((await post({ basePrice: 9.5 })).status).toBe(400); // un número, no una cadena
    expect((await post({ taxRate: "150" })).status).toBe(400);
    expect((await post({ slug: "forzado" })).status).toBe(400);
    expect((await post({ id: randomUUID() })).status).toBe(400);
    expect((await post({ categoryId: randomUUID() })).body.error.code).toBe("CATEGORY_NOT_FOUND");
    expect((await post({ allergens: ["marcianos"] })).body.error.code).toBe("UNKNOWN_ALLERGEN");
    for (const url of [
      "javascript:alert(1)",
      "http://insecure.example/a.png",
      "../secreto.png",
      "data:image/png;base64,AAAA",
    ]) {
      expect((await post({ image: { url, alt: "" } })).status, url).toBe(400);
    }
    expect(
      (await post({ image: { url: "https://cdn.example.com/p.webp", alt: "Pizza" } })).status,
    ).toBe(201);
    expect(await prisma.product.count({ where: { slug: { startsWith: "pizza-cuatro" } } })).toBe(1);
  });

  it("validates the option groups", async () => {
    const { headers } = await withRole("ADMIN");
    const group = (changes: Record<string, unknown>) => ({
      name: "Tamaño",
      kind: "SIZE",
      required: true,
      minSelect: 1,
      maxSelect: 1,
      options: [{ name: "A", isDefault: true }, { name: "B" }],
      ...changes,
    });
    const post = async (changes: Record<string, unknown>) =>
      api()
        .post("/api/v1/admin/products")
        .set(headers)
        .send(await validProduct({ optionGroups: [group(changes)] }));

    expect((await post({ minSelect: 0 })).status).toBe(400); // obligatorio exige al menos 1
    expect(
      (
        await post({
          maxSelect: 1,
          minSelect: 2,
          options: [{ name: "A" }, { name: "B" }, { name: "C" }],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await post({
          options: [
            { name: "A", isDefault: true },
            { name: "B", isDefault: true },
          ],
        })
      ).status,
    ).toBe(400);
    expect((await post({ options: [] })).status).toBe(400);
    expect((await post({ options: [{ name: "A", priceDelta: "1,50" }] })).status).toBe(400);
    expect((await post({ kind: "TAMAÑO" })).status).toBe(400);
  });

  it("updates the price and availability, audits the change and does not alter past orders", async () => {
    const { user, headers } = await withRole("ADMIN");
    const customer = await ctx.userWithToken({ username: "cliente1", phone: "+34 600 000 002" });
    const product = await prisma.product.findFirstOrThrow({
      where: { slug: "margherita" },
      include: { optionGroups: { include: { options: true } } },
    });
    const optionIds = product.optionGroups
      .filter((g) => g.required)
      .flatMap((g) => g.options.filter((o) => o.isDefault).map((o) => o.id));
    await prisma.openingHours.deleteMany();
    await prisma.openingHours.createMany({
      data: [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({
        dayOfWeek,
        openMinute: 0,
        closeMinute: 1440,
      })),
    });
    const order = await api()
      .post("/api/v1/orders")
      .set(customer.headers)
      .set("Idempotency-Key", randomUUID())
      .send({
        items: [{ productId: product.id, quantity: 1, optionIds }],
        type: "PICKUP",
        paymentMethod: "CASH_PICKUP",
      });
    expect(order.body.data.totals.total).toBe("9.50");

    const patched = await api()
      .patch(`/api/v1/admin/products/${product.id}`)
      .set(headers)
      .send({ basePrice: "11.00", popular: false });
    expect(patched.status).toBe(200);
    expect(patched.body.data).toMatchObject({ basePrice: "11.00", popular: false });

    expect((await api().get("/api/v1/products/margherita")).body.data.price).toBe("11.00");
    const quote = await api()
      .post("/api/v1/checkout/quote")
      .send({ items: [{ productId: product.id, quantity: 1, optionIds }] });
    expect(quote.body.data.totals.total).toBe("11.00");
    // El pedido histórico conserva el precio de entonces.
    const old = await api().get(`/api/v1/orders/${order.body.data.id}`).set(customer.headers);
    expect(old.body.data.items[0]).toMatchObject({ unitPrice: "9.50" });

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "product.update", entityId: product.id },
    });
    expect(audit).toMatchObject({ actorId: user.id });
    expect(audit.before).toMatchObject({ basePrice: "9.50" });
    expect(audit.after).toMatchObject({ basePrice: "11.00", changed: ["basePrice", "popular"] });

    await api()
      .patch(`/api/v1/admin/products/${product.id}`)
      .set(headers)
      .send({ available: false });
    const blocked = await api()
      .post("/api/v1/checkout/quote")
      .send({ items: [{ productId: product.id, quantity: 1, optionIds }] });
    expect(blocked.body.error.code).toBe("PRODUCT_UNAVAILABLE");
    expect((await api().get("/api/v1/products/margherita")).body.data.available).toBe(false);
  });

  it("keeps the ids of existing options when editing, soft-deletes removed ones and rejects foreign ids", async () => {
    const { headers } = await withRole("ADMIN");
    const created = (
      await api()
        .post("/api/v1/admin/products")
        .set(headers)
        .send(await validProduct())
    ).body.data;
    const [group] = created.optionGroups;
    const [medium, family] = group.options;

    const edited = await api()
      .patch(`/api/v1/admin/products/${created.id}`)
      .set(headers)
      .send({
        optionGroups: [
          {
            id: group.id,
            name: "Tamaño",
            kind: "SIZE",
            required: true,
            minSelect: 1,
            maxSelect: 1,
            options: [
              { id: medium.id, name: "Mediana", priceDelta: "0.50", isDefault: true },
              { name: "Pequeña", priceDelta: "-1.00" },
            ],
          },
          {
            name: "Extras",
            kind: "EXTRA_INGREDIENT",
            maxSelect: 3,
            options: [{ name: "Queso", priceDelta: "1.50" }],
          },
        ],
      });
    expect(edited.status).toBe(200);
    const groups = edited.body.data.optionGroups;
    expect(groups).toHaveLength(2);
    expect(groups[0].id).toBe(group.id);
    expect(groups[0].options.map((option: { id: string; name: string }) => option.name)).toEqual([
      "Mediana",
      "Pequeña",
    ]);
    expect(groups[0].options[0]).toMatchObject({ id: medium.id, priceDelta: "0.50" });
    // «Familiar» ya no está: borrada de forma lógica (no sale en la carta).
    expect(
      (await prisma.productOption.findUniqueOrThrow({ where: { id: family.id } })).deletedAt,
    ).not.toBeNull();
    const publicOptions = (await api().get(`/api/v1/products/${created.slug}`)).body.data
      .optionGroups[0].options;
    expect(publicOptions.map((option: { name: string }) => option.name)).toEqual([
      "Mediana",
      "Pequeña",
    ]);

    const other = (
      await api()
        .post("/api/v1/admin/products")
        .set(headers)
        .send(await validProduct({ name: "Otra pizza" }))
    ).body.data;
    const stolen = await api()
      .patch(`/api/v1/admin/products/${created.id}`)
      .set(headers)
      .send({
        optionGroups: [
          { id: other.optionGroups[0].id, name: "X", kind: "SIZE", options: [{ name: "Y" }] },
        ],
      });
    expect(stolen.status).toBe(422);
    expect(stolen.body.error.code).toBe("INVALID_OPTION_GROUP");
  });

  it("deletes softly (also from saved carts), restores and filters by status", async () => {
    const { headers } = await withRole("ADMIN");
    const customer = await ctx.userWithToken({ username: "cliente1", phone: "+34 600 000 002" });
    const product = await prisma.product.findFirstOrThrow({ where: { slug: "diavola" } });
    await api()
      .put("/api/v1/cart")
      .set(customer.headers)
      .send({ items: [{ productId: product.id, quantity: 1, optionIds: [] }] });
    expect(await prisma.cartItem.count({ where: { productId: product.id } })).toBe(1);

    expect((await api().delete(`/api/v1/admin/products/${product.id}`).set(headers)).status).toBe(
      204,
    );
    expect((await api().get("/api/v1/products/diavola")).status).toBe(404);
    expect(await prisma.cartItem.count({ where: { productId: product.id } })).toBe(0);
    expect(await prisma.product.count({ where: { id: product.id } })).toBe(1); // sigue en la base de datos
    expect((await api().delete(`/api/v1/admin/products/${product.id}`).set(headers)).status).toBe(
      404,
    );

    const deleted = await api().get("/api/v1/admin/products?status=deleted").set(headers);
    expect(deleted.body.data.map((item: { id: string }) => item.id)).toEqual([product.id]);
    expect((await api().get("/api/v1/admin/products").set(headers)).body.data).toHaveLength(14);

    const restored = await api().post(`/api/v1/admin/products/${product.id}/restore`).set(headers);
    expect(restored.status).toBe(200);
    expect(restored.body.data.deleted).toBe(false);
    expect((await api().get("/api/v1/products/diavola")).status).toBe(200);

    await api()
      .patch(`/api/v1/admin/products/${product.id}`)
      .set(headers)
      .send({ available: false });
    const unavailable = await api().get("/api/v1/admin/products?status=unavailable").set(headers);
    expect(unavailable.body.data.map((item: { slug: string }) => item.slug)).toContain("diavola");
    expect((await api().get("/api/v1/admin/products?q=DIAV").set(headers)).body.data).toHaveLength(
      1,
    );
    expect((await api().get("/api/v1/admin/products?status=otro").set(headers)).status).toBe(400);
  });

  it("lists the allergens to choose from", async () => {
    const { headers } = await withRole("ADMIN");
    const list = (await api().get("/api/v1/admin/allergens").set(headers)).body.data;
    expect(list).toHaveLength(14);
    expect(list).toContainEqual({ code: "gluten", name: "Gluten" });
  });

  it("answers 404 for unknown products and rejects an empty edit", async () => {
    const { headers } = await withRole("ADMIN");
    expect((await api().get(`/api/v1/admin/products/${randomUUID()}`).set(headers)).status).toBe(
      404,
    );
    expect((await api().get("/api/v1/admin/products/no-uuid").set(headers)).status).toBe(404);
    const product = await prisma.product.findFirstOrThrow();
    expect(
      (await api().patch(`/api/v1/admin/products/${product.id}`).set(headers).send({})).status,
    ).toBe(400);
  });
});
