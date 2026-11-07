import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestClient, type PrismaClient } from "./helpers.js";
import { getTestDatabaseUrl } from "./test-database.js";

let prisma: PrismaClient;

beforeAll(() => {
  prisma = createTestClient();
});

afterAll(async () => {
  await prisma.$disconnect();
});

const EXPECTED_TABLES = [
  "Address",
  "Allergen",
  "AuditLog",
  "Cart",
  "CartItem",
  "CartItemOption",
  "Category",
  "Coupon",
  "CouponRedemption",
  "DeliveryZone",
  "IdempotencyRecord",
  "Ingredient",
  "Invoice",
  "InvoiceSequence",
  "LoyaltyAccount",
  "LoyaltyTransaction",
  "NotificationLog",
  "OpeningHours",
  "OptionGroup",
  "Order",
  "OrderDiscount",
  "OrderItem",
  "OrderItemOption",
  "OrderStatusHistory",
  "Payment",
  "PaymentEvent",
  "Product",
  "ProductAllergen",
  "ProductImage",
  "ProductIngredient",
  "ProductOption",
  "Profile",
  "Promotion",
  "PromotionProduct",
  "Reward",
  "RewardRedemption",
  "SpecialOpeningHours",
  "StoreSettings",
  "UserRole",
];

describe("migrations", () => {
  it("apply on an empty database and create every table", async () => {
    const rows = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
      ORDER BY tablename`;
    expect(rows.map((row) => row.tablename)).toEqual(EXPECTED_TABLES);
  });

  it("record every migration file as applied", async () => {
    const files = readdirSync("prisma/migrations", { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    const applied = await prisma.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name FROM _prisma_migrations
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
      ORDER BY migration_name`;
    expect(applied.map((row) => row.migration_name)).toEqual(files);
  });

  it("match schema.prisma exactly (no drift between migrations and the schema)", () => {
    // Si schema.prisma cambia sin crear su migración, `migrate diff` devuelve código 2 y falla.
    expect(() =>
      execFileSync(
        "npx",
        [
          "prisma",
          "migrate",
          "diff",
          "--from-config-datasource",
          "--to-schema",
          "prisma/schema.prisma",
          "--exit-code",
        ],
        {
          env: { ...process.env, DATABASE_URL: getTestDatabaseUrl() },
          stdio: "pipe",
          shell: process.platform === "win32",
        },
      ),
    ).not.toThrow();
  });

  it("enable row level security on every table (default deny for Supabase clients)", async () => {
    const rows = await prisma.$queryRaw<Array<{ relname: string }>>`
      SELECT c.relname FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity`;
    expect(
      rows.map((row) => row.relname),
      "tables without RLS",
    ).toEqual([]);
  });

  it("install the extension used by the opening hours exclusion constraints", async () => {
    const rows = await prisma.$queryRaw<Array<{ extname: string }>>`
      SELECT extname FROM pg_extension WHERE extname = 'btree_gist'`;
    expect(rows).toHaveLength(1);
  });
});
