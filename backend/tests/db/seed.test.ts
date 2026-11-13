import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { seedDemoData } from "../../prisma/seed-demo-data.js";
import { createTestClient, resetDatabase, type PrismaClient } from "./helpers.js";

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

describe("demo data seed", () => {
  it("creates the catalog, store configuration, promotions and rewards", async () => {
    const summary = await seedDemoData(prisma);
    expect(summary).toEqual({
      allergens: 14,
      categories: 4,
      products: 15,
      optionGroups: 18,
      openingHours: 12,
      deliveryZones: 3,
      promotions: 3,
      coupons: 1,
      rewards: 3,
    });
  });

  it("is idempotent: running it twice leaves exactly the same data", async () => {
    const first = await seedDemoData(prisma);
    const second = await seedDemoData(prisma);
    expect(second).toEqual(first);
    expect(await prisma.storeSettings.count()).toBe(1);
    expect(await prisma.productIngredient.count()).toBe(
      await prisma.productIngredient.count({ where: { position: { gte: 0 } } }),
    );
  });

  it("gives every pizza size, dough and extras options, with a default for each required group", async () => {
    await seedDemoData(prisma);
    const pizzas = await prisma.product.findMany({
      where: { category: { slug: "pizzas" } },
      include: { optionGroups: { include: { options: true } } },
    });
    expect(pizzas).toHaveLength(6);
    for (const pizza of pizzas) {
      expect(pizza.optionGroups.map((group) => group.kind).sort()).toEqual(
        ["DOUGH", "EXTRA_INGREDIENT", "SIZE"].sort(),
      );
      for (const group of pizza.optionGroups.filter((item) => item.required)) {
        expect(group.options.filter((option) => option.isDefault)).toHaveLength(1);
      }
    }
  });

  it("applies the 2026 Spanish VAT rates: 10 % prepared food and water, 21 % alcohol and sweetened soft drinks", async () => {
    await seedDemoData(prisma);
    const rates = Object.fromEntries(
      (await prisma.product.findMany({ include: { category: true } })).map((product) => [
        product.slug,
        product.taxRate.toString(),
      ]),
    );

    // Comida preparada y agua: tipo reducido.
    for (const slug of ["margherita", "burrata", "focaccia", "tiramisu", "panna-cotta", "agua"]) {
      expect(rates[slug], slug).toBe("10");
    }
    // Alcohol y bebidas refrescantes con azúcares añadidos: tipo general.
    for (const slug of ["cerveza", "refresco-cola", "limonada"]) {
      expect(rates[slug], slug).toBe("21");
    }
    // Nada se vende a un tipo que no sea el reducido o el general.
    expect(new Set(Object.values(rates))).toEqual(new Set(["10", "21"]));
  });

  it("stores VAT-inclusive prices", async () => {
    await seedDemoData(prisma);
    const margherita = await prisma.product.findUniqueOrThrow({ where: { slug: "margherita" } });
    expect(margherita.basePrice.toString()).toBe("9.5");
  });

  it("declares allergens as the 14 EU allergens and links them to products", async () => {
    await seedDemoData(prisma);
    expect(await prisma.allergen.count()).toBe(14);
    const tiramisu = await prisma.product.findUniqueOrThrow({
      where: { slug: "tiramisu" },
      include: { allergens: { include: { allergen: true } } },
    });
    expect(tiramisu.allergens.map((link) => link.allergen.code).sort()).toEqual([
      "gluten",
      "huevos",
      "lacteos",
    ]);
  });

  it("configures a weekly schedule that is closed on Mondays and valid on the other days", async () => {
    await seedDemoData(prisma);
    const days = new Set((await prisma.openingHours.findMany()).map((row) => row.dayOfWeek));
    expect(days.has(1)).toBe(false);
    expect([...days].sort()).toEqual([2, 3, 4, 5, 6, 7]);
  });

  it("creates the welcome coupon tied to its promotion and the loyalty rewards in ascending cost", async () => {
    await seedDemoData(prisma);
    const coupon = await prisma.coupon.findUniqueOrThrow({
      where: { code: "BIENVENIDO10" },
      include: { promotion: true },
    });
    expect(coupon.promotion.firstOrderOnly).toBe(true);

    const rewards = await prisma.reward.findMany({ orderBy: { sortOrder: "asc" } });
    expect(rewards.map((reward) => reward.pointsCost)).toEqual([100, 250, 400]);
  });

  it("does not create users: they are created by Supabase Auth", async () => {
    await seedDemoData(prisma);
    expect(await prisma.profile.count()).toBe(0);
  });
});
