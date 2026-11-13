import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
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

describe("users and addresses", () => {
  it("enforces unique, lowercase and well-formed emails", async () => {
    const user = await createUser(prisma, { email: "ana@example.test" });
    await expectDbRejection(createUser(prisma, { email: "ana@example.test" }), /unique/i);
    await expectDbRejection(
      createUser(prisma, { email: "Ana@Example.test" }),
      /ck_profile_email_lowercase/,
    );
    await expectDbRejection(
      createUser(prisma, { email: "not-an-email" }),
      /ck_profile_email_format/,
    );
    expect(user.id).toBeTruthy();
  });

  it("allows one role of each kind per user and several different roles", async () => {
    const user = await createUser(prisma);
    await prisma.userRole.create({ data: { userId: user.id, role: "STAFF" } });
    await prisma.userRole.create({ data: { userId: user.id, role: "KITCHEN" } });
    await expectDbRejection(
      prisma.userRole.create({ data: { userId: user.id, role: "STAFF" } }),
      /unique/i,
    );
  });

  it("allows a single active default address per user", async () => {
    const user = await createUser(prisma);
    const base = {
      userId: user.id,
      recipientName: "Ana",
      line1: "Calle 1",
      postalCode: "28001",
      city: "Madrid",
    };
    const first = await prisma.address.create({ data: { ...base, isDefault: true } });
    await expectDbRejection(
      prisma.address.create({ data: { ...base, line1: "Calle 2", isDefault: true } }),
      /unique|uq_address_default_per_user/i,
    );
    await prisma.address.create({ data: { ...base, line1: "Calle 3", isDefault: false } });

    // Al archivar la dirección predeterminada, otra puede ocupar su lugar.
    await prisma.address.update({ where: { id: first.id }, data: { deletedAt: new Date() } });
    const replacement = await prisma.address.create({
      data: { ...base, line1: "Calle 4", isDefault: true },
    });
    expect(replacement.isDefault).toBe(true);
  });

  it("removes addresses with their owner but protects ledgers (users are never hard-deleted)", async () => {
    const user = await createUser(prisma);
    await prisma.address.create({
      data: {
        userId: user.id,
        recipientName: "Ana",
        line1: "Calle 1",
        postalCode: "28001",
        city: "Madrid",
      },
    });
    await prisma.profile.delete({ where: { id: user.id } });
    expect(await prisma.address.count()).toBe(0);
  });
});

describe("catalog", () => {
  it("requires clean, unique slugs", async () => {
    await createProduct(prisma, { slug: "margherita" });
    const categoryId = (await prisma.category.findFirstOrThrow()).id;
    await expectDbRejection(createProduct(prisma, { slug: "margherita", categoryId }), /unique/i);
    await expectDbRejection(
      createProduct(prisma, { slug: "Con Espacios", categoryId }),
      /ck_product_slug/,
    );
    await expectDbRejection(
      prisma.category.create({ data: { slug: "-mal", name: "Mal" } }),
      /ck_category_slug/,
    );
  });

  it("rejects negative prices and impossible tax rates", async () => {
    const categoryId = (await prisma.category.create({ data: { slug: "c", name: "C" } })).id;
    await expectDbRejection(
      createProduct(prisma, { categoryId, basePrice: new Prisma.Decimal("-1.00") }),
      /ck_product_base_price/,
    );
    await expectDbRejection(
      createProduct(prisma, { categoryId, taxRate: new Prisma.Decimal("150.00") }),
      /ck_product_tax_rate|out of range|numeric/i,
    );
  });

  it("does not allow deleting a category that still has products", async () => {
    const product = await createProduct(prisma);
    await expectDbRejection(
      prisma.category.delete({ where: { id: product.categoryId } }),
      /foreign key|constraint/i,
    );
  });

  it("allows a single primary image per product", async () => {
    const product = await createProduct(prisma);
    await prisma.productImage.create({
      data: { productId: product.id, url: "/a.webp", isPrimary: true },
    });
    await expectDbRejection(
      prisma.productImage.create({
        data: { productId: product.id, url: "/b.webp", isPrimary: true },
      }),
      /unique|uq_product_image_primary/i,
    );
    await prisma.productImage.create({ data: { productId: product.id, url: "/c.webp" } });
  });

  it("keeps option groups coherent (min <= max, required needs at least one)", async () => {
    const product = await createProduct(prisma);
    const base = { productId: product.id, name: "Tamaño", kind: "SIZE" as const };
    await expectDbRejection(
      prisma.optionGroup.create({ data: { ...base, minSelect: 3, maxSelect: 2 } }),
      /ck_option_group_select/,
    );
    await expectDbRejection(
      prisma.optionGroup.create({ data: { ...base, required: true, minSelect: 0, maxSelect: 1 } }),
      /ck_option_group_required/,
    );
    const group = await prisma.optionGroup.create({
      data: { ...base, required: true, minSelect: 1, maxSelect: 1 },
    });
    // Las opciones desaparecen con su grupo.
    await prisma.productOption.create({ data: { groupId: group.id, name: "Mediana" } });
    await prisma.optionGroup.delete({ where: { id: group.id } });
    expect(await prisma.productOption.count()).toBe(0);
  });

  it("deletes ingredients/allergen links with the product but protects them while in use", async () => {
    const product = await createProduct(prisma);
    const allergen = await prisma.allergen.create({ data: { code: "gluten", name: "Gluten" } });
    await prisma.productAllergen.create({
      data: { productId: product.id, allergenId: allergen.id },
    });
    await expectDbRejection(
      prisma.allergen.delete({ where: { id: allergen.id } }),
      /foreign key|constraint/i,
    );
    await prisma.product.delete({ where: { id: product.id } });
    await prisma.allergen.delete({ where: { id: allergen.id } });
  });
});

describe("cart", () => {
  it("allows one cart per user and positive quantities only", async () => {
    const user = await createUser(prisma);
    const product = await createProduct(prisma);
    const cart = await prisma.cart.create({ data: { userId: user.id } });
    await expectDbRejection(prisma.cart.create({ data: { userId: user.id } }), /unique/i);
    await expectDbRejection(
      prisma.cartItem.create({ data: { cartId: cart.id, productId: product.id, quantity: 0 } }),
      /ck_cart_item_quantity/,
    );
  });
});

describe("store settings and opening hours", () => {
  const settings = {
    name: "FORNEA",
    addressLine: "Calle Ejemplo 12",
    postalCode: "28000",
    city: "Madrid",
    phone: "+34 900 000 000",
    email: "hola@fornea.example",
    prepTimeMinutes: 20,
    deliveryTimeMinutes: 40,
    loyaltyPointsPerEuro: new Prisma.Decimal("1.0000"),
  };

  it("keeps a single settings row", async () => {
    await prisma.storeSettings.create({ data: settings });
    await expectDbRejection(
      prisma.storeSettings.create({ data: { ...settings, id: 2 } }),
      /ck_store_settings_singleton/,
    );
    await expectDbRejection(prisma.storeSettings.create({ data: settings }), /unique/i);
  });

  it("validates times, slots and the loyalty rule", async () => {
    await expectDbRejection(
      prisma.storeSettings.create({ data: { ...settings, prepTimeMinutes: -5 } }),
      /ck_store_settings_times/,
    );
    await expectDbRejection(
      prisma.storeSettings.create({ data: { ...settings, slotMinutes: 0 } }),
      /ck_store_settings_slots/,
    );
    await expectDbRejection(
      prisma.storeSettings.create({
        data: { ...settings, loyaltyPointsPerEuro: new Prisma.Decimal("-1") },
      }),
      /ck_store_settings_loyalty/,
    );
  });

  it("rejects invalid weekly shifts and overlapping shifts on the same day", async () => {
    await expectDbRejection(
      prisma.openingHours.create({ data: { dayOfWeek: 8, openMinute: 600, closeMinute: 900 } }),
      /ck_opening_hours_day/,
    );
    await expectDbRejection(
      prisma.openingHours.create({ data: { dayOfWeek: 2, openMinute: 900, closeMinute: 600 } }),
      /ck_opening_hours_range/,
    );
    await expectDbRejection(
      prisma.openingHours.create({ data: { dayOfWeek: 2, openMinute: 600, closeMinute: 1500 } }),
      /ck_opening_hours_range/,
    );

    await prisma.openingHours.create({ data: { dayOfWeek: 2, openMinute: 780, closeMinute: 960 } });
    await expectDbRejection(
      prisma.openingHours.create({ data: { dayOfWeek: 2, openMinute: 900, closeMinute: 1020 } }),
      /ex_opening_hours_no_overlap|exclusion/i,
    );
    // Franjas contiguas o en otro día sí se permiten.
    await prisma.openingHours.create({
      data: { dayOfWeek: 2, openMinute: 960, closeMinute: 1020 },
    });
    await prisma.openingHours.create({ data: { dayOfWeek: 3, openMinute: 780, closeMinute: 960 } });
  });

  it("models holidays as closed days without hours, or special shifts", async () => {
    const date = new Date("2026-12-25");
    await expectDbRejection(
      prisma.specialOpeningHours.create({
        data: { date, closed: true, openMinute: 600, closeMinute: 900 },
      }),
      /ck_special_hours/,
    );
    await expectDbRejection(
      prisma.specialOpeningHours.create({ data: { date, closed: false } }),
      /ck_special_hours/,
    );
    await prisma.specialOpeningHours.create({ data: { date, closed: true, note: "Navidad" } });
    await expectDbRejection(
      prisma.specialOpeningHours.create({
        data: { date, closed: false, openMinute: 600, closeMinute: 900 },
      }),
      /ex_special_hours_no_overlap|exclusion/i,
    );
  });
});

describe("delivery zones", () => {
  const zone = {
    name: "Centro",
    deliveryFee: new Prisma.Decimal("2.50"),
    estimatedMinutes: 35,
  };

  it("requires valid five-digit postal codes and sensible amounts", async () => {
    await expectDbRejection(
      prisma.deliveryZone.create({ data: { ...zone, postalCodes: [] } }),
      /ck_delivery_zone_postal_codes/,
    );
    await expectDbRejection(
      prisma.deliveryZone.create({ data: { ...zone, postalCodes: ["2800"] } }),
      /ck_delivery_zone_postal_codes/,
    );
    await expectDbRejection(
      prisma.deliveryZone.create({ data: { ...zone, postalCodes: ["28001", "abcde"] } }),
      /ck_delivery_zone_postal_codes/,
    );
    await expectDbRejection(
      prisma.deliveryZone.create({
        data: { ...zone, postalCodes: ["28001"], deliveryFee: new Prisma.Decimal("-1") },
      }),
      /ck_delivery_zone_amounts/,
    );
    // Un prefijo de provincia con asterisco es válido; uno mal formado, no.
    for (const bad of ["*", "2*", "280*", "28**"]) {
      await expectDbRejection(
        prisma.deliveryZone.create({ data: { ...zone, postalCodes: ["28001", bad] } }),
        /ck_delivery_zone_postal_codes/,
      );
    }
    const wide = await prisma.deliveryZone.create({
      data: { ...zone, name: "Toda la Comunidad", postalCodes: ["28*"] },
    });
    expect(wide.postalCodes).toEqual(["28*"]);
    await prisma.deliveryZone.delete({ where: { id: wide.id } });
    const created = await prisma.deliveryZone.create({
      data: { ...zone, postalCodes: ["28001", "28002"] },
    });
    expect(created.postalCodes).toEqual(["28001", "28002"]);
  });

  it("finds the zone that covers a postal code (case 9: unknown codes find none)", async () => {
    await prisma.deliveryZone.create({ data: { ...zone, postalCodes: ["28001", "28002"] } });
    expect(
      await prisma.deliveryZone.count({ where: { postalCodes: { has: "28002" }, active: true } }),
    ).toBe(1);
    expect(
      await prisma.deliveryZone.count({ where: { postalCodes: { has: "08001" }, active: true } }),
    ).toBe(0);
  });
});

describe("promotions, coupons and rewards", () => {
  const percent = {
    name: "10 %",
    description: "Descuento",
    kind: "DISCOUNT" as const,
    discountType: "PERCENT" as const,
    discountValue: new Prisma.Decimal("10.00"),
  };

  it("validates discounts, combos and dates", async () => {
    await expectDbRejection(
      prisma.promotion.create({
        data: { ...percent, discountValue: new Prisma.Decimal("150.00") },
      }),
      /ck_promotion_discount/,
    );
    await expectDbRejection(
      prisma.promotion.create({ data: { ...percent, discountType: null, discountValue: null } }),
      /ck_promotion_discount/,
    );
    await expectDbRejection(
      prisma.promotion.create({ data: { name: "Combo", description: "x", kind: "COMBO" } }),
      /ck_promotion_combo/,
    );
    await expectDbRejection(
      prisma.promotion.create({
        data: { ...percent, startsAt: new Date("2026-12-02"), endsAt: new Date("2026-12-01") },
      }),
      /ck_promotion_dates/,
    );
    await prisma.promotion.create({
      data: {
        name: "Combo",
        description: "x",
        kind: "COMBO",
        comboPrice: new Prisma.Decimal("15.90"),
      },
    });
  });

  it("requires well-formed, unique, uppercase coupon codes", async () => {
    const promotion = await prisma.promotion.create({ data: percent });
    await prisma.coupon.create({ data: { code: "BIENVENIDO10", promotionId: promotion.id } });
    await expectDbRejection(
      prisma.coupon.create({ data: { code: "BIENVENIDO10", promotionId: promotion.id } }),
      /unique/i,
    );
    await expectDbRejection(
      prisma.coupon.create({ data: { code: "minusculas", promotionId: promotion.id } }),
      /ck_coupon_code/,
    );
    await expectDbRejection(
      prisma.coupon.create({ data: { code: "AB", promotionId: promotion.id } }),
      /ck_coupon_code/,
    );
  });

  it("allows only one redemption of a coupon per order", async () => {
    const user = await createUser(prisma);
    const product = await createProduct(prisma);
    const promotion = await prisma.promotion.create({ data: percent });
    const coupon = await prisma.coupon.create({
      data: { code: "UNICO10", promotionId: promotion.id },
    });
    const { createOrder } = await import("./helpers.js");
    const order = await createOrder(prisma, { userId: user.id, productId: product.id });
    await prisma.couponRedemption.create({
      data: { couponId: coupon.id, userId: user.id, orderId: order.id },
    });
    await expectDbRejection(
      prisma.couponRedemption.create({
        data: { couponId: coupon.id, userId: user.id, orderId: order.id },
      }),
      /unique/i,
    );
  });

  it("requires a reward to give exactly one benefit at a positive cost", async () => {
    const product = await createProduct(prisma);
    const base = { name: "Recompensa", pointsCost: 100 };
    await expectDbRejection(prisma.reward.create({ data: base }), /ck_reward_benefit/);
    await expectDbRejection(
      prisma.reward.create({
        data: { ...base, freeProductId: product.id, discountAmount: new Prisma.Decimal("5.00") },
      }),
      /ck_reward_benefit/,
    );
    await expectDbRejection(
      prisma.reward.create({ data: { ...base, pointsCost: 0, freeProductId: product.id } }),
      /ck_reward_cost/,
    );
    await prisma.reward.create({ data: { ...base, discountAmount: new Prisma.Decimal("5.00") } });
  });
});

describe("transversal tables", () => {
  it("stores an idempotent response once per user, endpoint and key", async () => {
    const user = await createUser(prisma);
    const base = {
      userId: user.id,
      endpoint: "POST /api/v1/orders",
      key: "0b1c2d3e-aaaa-bbbb-cccc-ddddeeeeffff",
      requestHash: "abc123",
      expiresAt: new Date(Date.now() + 86_400_000),
    };
    await prisma.idempotencyRecord.create({ data: base });
    await expectDbRejection(prisma.idempotencyRecord.create({ data: base }), /unique/i);
    await prisma.idempotencyRecord.create({
      data: { ...base, endpoint: "POST /api/v1/loyalty/redemptions" },
    });
    await expectDbRejection(
      prisma.idempotencyRecord.create({ data: { ...base, key: "corta", endpoint: "otro" } }),
      /ck_idempotency_key/,
    );
  });

  it("keeps the audit log append-only", async () => {
    const admin = await createUser(prisma);
    const entry = await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: "product.update",
        entityType: "Product",
        entityId: randomUUID(),
      },
    });
    await expectDbRejection(
      prisma.auditLog.update({ where: { id: entry.id }, data: { action: "tampered" } }),
      /append-only/i,
    );
    await expectDbRejection(prisma.auditLog.delete({ where: { id: entry.id } }), /append-only/i);
    // Los usuarios con historial no se pueden borrar: se anonimizan.
    await expectDbRejection(
      prisma.profile.delete({ where: { id: admin.id } }),
      /foreign key|constraint/i,
    );
  });

  it("avoids sending the same notification twice", async () => {
    const user = await createUser(prisma);
    const product = await createProduct(prisma);
    const { createOrder } = await import("./helpers.js");
    const order = await createOrder(prisma, { userId: user.id, productId: product.id });
    const data = {
      orderId: order.id,
      template: "order-confirmation",
      recipient: "cliente@example.test",
    };
    await prisma.notificationLog.create({ data });
    await expectDbRejection(prisma.notificationLog.create({ data }), /unique/i);
  });
});
