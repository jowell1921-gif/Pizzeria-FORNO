import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { seedDemoData } from "../../prisma/seed-demo-data.js";
import {
  Category,
  DeliveryCheck,
  DeliveryZone,
  Product,
  Promotion,
  StoreSettings,
} from "../../src/docs/schemas.js";
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

const get = (path: string) => request(ctx.app).get(`/api/v1${path}`);

describe("GET /categories and /products", () => {
  it("is public and returns the menu in the documented shape", async () => {
    const categories = await get("/categories");
    expect(categories.status).toBe(200);
    expect(categories.headers["cache-control"]).toMatch(/public, max-age=/);
    const parsedCategories = categories.body.data.map((item: unknown) => Category.parse(item));
    expect(parsedCategories.map((item: { slug: string }) => item.slug)).toEqual([
      "pizzas",
      "entrantes",
      "bebidas",
      "postres",
    ]);

    const products = await get("/products");
    expect(products.status).toBe(200);
    expect(products.body.data).toHaveLength(15);
    for (const item of products.body.data) Product.parse(item);
  });

  it("filters by category and popularity", async () => {
    const pizzas = await get("/products?category=pizzas");
    expect(pizzas.body.data).toHaveLength(6);
    expect(
      pizzas.body.data.every((item: { categorySlug: string }) => item.categorySlug === "pizzas"),
    ).toBe(true);

    const popular = await get("/products?popular=true");
    expect(popular.body.data.length).toBeGreaterThan(0);
    expect(popular.body.data.every((item: { popular: boolean }) => item.popular)).toBe(true);

    expect((await get("/products?popular=maybe")).status).toBe(400);
  });

  it("includes options with prices as decimal strings, ingredients and allergens", async () => {
    const { body } = await get("/products/margherita");
    const product = Product.parse(body.data);
    expect(product.price).toBe("9.50");
    expect(product.ingredients.length).toBeGreaterThan(0);
    expect(product.allergens.map((allergen) => allergen.code)).toContain("gluten");
    expect(product.optionGroups.map((group) => group.kind)).toEqual(
      expect.arrayContaining(["SIZE", "DOUGH", "EXTRA_INGREDIENT"]),
    );
    expect(product.image?.url).toMatch(/^\/image\//);
  });

  it("finds a product by id and answers 404 when it does not exist", async () => {
    const product = await prisma.product.findFirstOrThrow({ where: { slug: "margherita" } });
    expect((await get(`/products/${product.id}`)).body.data.slug).toBe("margherita");
    expect((await get("/products/no-existe")).status).toBe(404);
    expect((await get("/products/11111111-1111-4111-8111-111111111111")).status).toBe(404);
  });

  it("hides deleted products and products of inactive categories", async () => {
    await prisma.product.updateMany({
      where: { slug: "margherita" },
      data: { deletedAt: new Date() },
    });
    expect((await get("/products/margherita")).status).toBe(404);
    expect((await get("/products?category=pizzas")).body.data).toHaveLength(5);

    await prisma.category.update({ where: { slug: "postres" }, data: { active: false } });
    expect(
      (await get("/categories")).body.data.map((item: { slug: string }) => item.slug),
    ).not.toContain("postres");
    expect(
      (await get("/products")).body.data.some(
        (item: { categorySlug: string }) => item.categorySlug === "postres",
      ),
    ).toBe(false);
  });

  it("marks unavailable products instead of hiding them", async () => {
    await prisma.product.updateMany({ where: { slug: "margherita" }, data: { available: false } });
    expect((await get("/products/margherita")).body.data.available).toBe(false);
  });
});

describe("GET /promotions", () => {
  it("lists active promotions with the public coupon code", async () => {
    const { body } = await get("/promotions");
    const promotions = body.data.map((item: unknown) => Promotion.parse(item));
    expect(promotions).toHaveLength(3);
    expect(
      promotions.find((item: { code: string | null }) => item.code === "BIENVENIDO10"),
    ).toBeDefined();
  });

  it("hides expired, inactive and not-yet-started promotions", async () => {
    const [first, second, third] = await prisma.promotion.findMany({
      orderBy: { createdAt: "asc" },
    });
    await prisma.promotion.update({
      where: { id: first!.id },
      data: { endsAt: new Date(Date.now() - 1000) },
    });
    await prisma.promotion.update({ where: { id: second!.id }, data: { active: false } });
    await prisma.promotion.update({
      where: { id: third!.id },
      data: { startsAt: new Date(Date.now() + 86_400_000) },
    });
    expect((await get("/promotions")).body.data).toHaveLength(0);
  });

  it("never exposes personal coupons", async () => {
    const { user } = await ctx.userWithToken();
    await prisma.coupon.updateMany({ data: { userId: user.id } });
    const { body } = await get("/promotions");
    expect(body.data.every((item: { code: string | null }) => item.code === null)).toBe(true);
  });
});

describe("GET /store/settings", () => {
  it("returns the public store data without internal fiscal fields", async () => {
    const { status, body } = await get("/store/settings");
    expect(status).toBe(200);
    const settings = StoreSettings.parse(body.data);
    expect(settings.openingHours.length).toBeGreaterThan(0);
    expect(settings.enabledPaymentMethods.length).toBeGreaterThan(0);
    expect(body.data).not.toHaveProperty("taxId");
    expect(body.data).not.toHaveProperty("legalName");
  });

  it("includes upcoming special days only", async () => {
    const day = (offset: number) => new Date(Date.now() + offset * 86_400_000);
    await prisma.specialOpeningHours.createMany({
      data: [
        { date: day(-5), closed: true, note: "pasado" },
        { date: day(5), closed: true, note: "futuro" },
      ],
    });
    const { body } = await get("/store/settings");
    expect(body.data.specialDays.map((item: { note: string }) => item.note)).toEqual(["futuro"]);
  });

  it("answers 503 when the store has not been configured", async () => {
    await prisma.storeSettings.deleteMany();
    const response = await get("/store/settings");
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("STORE_NOT_CONFIGURED");
  });
});

describe("delivery zones", () => {
  it("lists the active zones", async () => {
    const { body } = await get("/delivery-zones");
    expect(body.data).toHaveLength(3);
    for (const zone of body.data) DeliveryZone.parse(zone);
  });

  it("says whether a postal code is covered and gives the zone conditions", async () => {
    const covered = await get("/delivery-zones/check?postalCode=28001");
    const parsed = DeliveryCheck.parse(covered.body.data);
    expect(parsed.covered).toBe(true);
    expect(parsed.zone?.deliveryFee).toMatch(/^\d+\.\d{2}$/);

    const outside = DeliveryCheck.parse(
      (await get("/delivery-zones/check?postalCode=08001")).body.data,
    );
    expect(outside).toMatchObject({ covered: false, zone: null });
  });

  it("covers any postal code of the Comunidad de Madrid, and the exact zone wins", async () => {
    const wide = DeliveryCheck.parse(
      (await get("/delivery-zones/check?postalCode=28029")).body.data,
    );
    expect(wide.covered).toBe(true);
    expect(wide.zone?.name).toMatch(/Comunidad de Madrid/);
    expect((await get("/delivery-zones/check?postalCode=28999")).body.data.covered).toBe(true);
    // Un código con zona propia usa las condiciones de esa zona, no las de toda la Comunidad.
    const own = DeliveryCheck.parse(
      (await get("/delivery-zones/check?postalCode=28001")).body.data,
    );
    expect(own.zone?.name).toMatch(/Centro/);
    // Fuera de la Comunidad (Barcelona, Toledo) no se reparte.
    for (const outside of ["08001", "45001"]) {
      expect((await get(`/delivery-zones/check?postalCode=${outside}`)).body.data.covered).toBe(
        false,
      );
    }
  });

  it("does not cover a postal code of an inactive zone", async () => {
    await prisma.deliveryZone.updateMany({ data: { active: false } });
    expect((await get("/delivery-zones/check?postalCode=28001")).body.data.covered).toBe(false);
    expect((await get("/delivery-zones/check?postalCode=28029")).body.data.covered).toBe(false);
  });

  it("rejects a missing or malformed postal code", async () => {
    expect((await get("/delivery-zones/check")).status).toBe(400);
    expect((await get("/delivery-zones/check?postalCode=abc")).status).toBe(400);
    expect((await get("/delivery-zones/check?postalCode=28001%27%20OR%201=1")).status).toBe(400);
  });
});
