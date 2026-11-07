import { randomUUID } from "node:crypto";

import { expect } from "vitest";

import { createPrismaClient, Prisma, type PrismaClient } from "../../src/db/client.js";
import { getTestDatabaseUrl } from "./test-database.js";

export type { PrismaClient };
export { Prisma };

export function createTestClient(): PrismaClient {
  return createPrismaClient(getTestDatabaseUrl());
}

/** Vacía todas las tablas (salvo el historial de migraciones) y reinicia las secuencias. */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map((table) => `"${table.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

/**
 * Comprueba que la base de datos rechaza la operación y que el motivo coincide con `pattern`
 * (nombre de la restricción o texto del error).
 */
export async function expectDbRejection(promise: PromiseLike<unknown>, pattern: RegExp) {
  const error = (await Promise.resolve(promise).then(
    () => null,
    (caught: unknown) => caught,
  )) as (Error & { cause?: unknown; meta?: unknown }) | null;
  expect(error, "the database should reject this operation").not.toBeNull();
  const text = [error?.message, String(error?.cause ?? ""), JSON.stringify(error?.meta ?? {})].join(
    " ",
  );
  expect(text).toMatch(pattern);
}

// ───────────────────────────── Fábricas de datos de prueba ─────────────────────────────

let counter = 0;
const next = () => (counter += 1);

export async function createUser(
  prisma: PrismaClient,
  overrides: Partial<Prisma.ProfileUncheckedCreateInput> = {},
) {
  const id = overrides.id ?? randomUUID();
  return prisma.profile.create({
    data: {
      id,
      email: `user-${id.slice(0, 8)}@example.test`,
      fullName: "Cliente de Prueba",
      ...overrides,
    },
  });
}

export async function createLoyaltyAccount(prisma: PrismaClient, userId: string) {
  return prisma.loyaltyAccount.create({ data: { userId } });
}

export async function createProduct(
  prisma: PrismaClient,
  overrides: Partial<Prisma.ProductUncheckedCreateInput> = {},
) {
  const n = next();
  const category =
    overrides.categoryId === undefined
      ? await prisma.category.create({ data: { slug: `categoria-${n}`, name: `Categoría ${n}` } })
      : null;
  return prisma.product.create({
    data: {
      categoryId: overrides.categoryId ?? category!.id,
      slug: `producto-${n}`,
      name: `Producto ${n}`,
      description: "Producto de prueba",
      basePrice: "10.00",
      ...overrides,
    },
  });
}

interface OrderOptions {
  userId: string;
  productId: string;
  type?: "PICKUP" | "DELIVERY";
  status?: Prisma.OrderUncheckedCreateInput["status"];
  quantity?: number;
  unitPrice?: string;
  taxRate?: string;
  deliveryFee?: string;
  discountTotal?: string;
}

/**
 * Construye los datos de un pedido coherente (totales, IVA y líneas calculados con Decimal).
 * Se devuelve como objeto para que cada prueba pueda alterarlo y comprobar que la base de datos
 * rechaza las incoherencias.
 */
export function buildOrder(options: OrderOptions): Prisma.OrderUncheckedCreateInput {
  const type = options.type ?? "PICKUP";
  const quantity = options.quantity ?? 2;
  const unitPrice = new Prisma.Decimal(options.unitPrice ?? "10.00");
  const taxRate = new Prisma.Decimal(options.taxRate ?? "10.00");
  const deliveryFee = new Prisma.Decimal(
    type === "DELIVERY" ? (options.deliveryFee ?? "2.50") : "0.00",
  );
  const discountTotal = new Prisma.Decimal(options.discountTotal ?? "0.00");

  const lineTotal = unitPrice.mul(quantity).toDecimalPlaces(2);
  const taxAmount = lineTotal.mul(taxRate).div(taxRate.add(100)).toDecimalPlaces(2);
  const subtotal = lineTotal;
  const total = subtotal.sub(discountTotal).add(deliveryFee);

  return {
    userId: options.userId,
    type,
    ...(options.status ? { status: options.status } : {}),
    customerName: "Cliente de Prueba",
    customerEmail: "cliente@example.test",
    ...(type === "DELIVERY"
      ? {
          deliveryName: "Cliente de Prueba",
          deliveryLine1: "Calle Ejemplo 1",
          deliveryPostalCode: "28001",
          deliveryCity: "Madrid",
        }
      : {}),
    subtotal,
    discountTotal,
    deliveryFee,
    total,
    taxTotal: taxAmount,
    items: {
      create: [
        {
          productId: options.productId,
          productName: "Producto de prueba",
          unitPrice,
          quantity,
          taxRate,
          lineTotal,
          taxAmount,
        },
      ],
    },
  };
}

/** Primera línea de un pedido construido con `buildOrder`, para poder alterarla en las pruebas. */
export function orderLine(
  data: Prisma.OrderUncheckedCreateInput,
): Prisma.OrderItemUncheckedCreateWithoutOrderInput {
  const items = data.items as { create: Prisma.OrderItemUncheckedCreateWithoutOrderInput[] };
  return items.create[0]!;
}

export async function createOrder(prisma: PrismaClient, options: OrderOptions) {
  return prisma.order.create({ data: buildOrder(options) });
}
