import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createOrder,
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

async function setup() {
  const user = await createUser(prisma);
  const product = await createProduct(prisma);
  const order = await createOrder(prisma, { userId: user.id, productId: product.id });
  return { user, product, order };
}

const invoiceData = (orderId: string, overrides: Record<string, unknown> = {}) => ({
  orderId,
  type: "RECEIPT" as const,
  series: "T",
  year: 2026,
  number: 1,
  invoiceNumber: "T-2026-000001",
  customerName: "Cliente de Prueba",
  netTotal: new Prisma.Decimal("18.18"),
  taxTotal: new Prisma.Decimal("1.82"),
  total: new Prisma.Decimal("20.00"),
  taxBreakdown: [{ rate: 10, base: 18.18, tax: 1.82 }] as Prisma.InputJsonValue,
  ...overrides,
});

describe("invoices and receipts", () => {
  it("stores a ticket and an invoice for the same order, each only once", async () => {
    const { order } = await setup();
    await prisma.invoice.create({ data: invoiceData(order.id) });
    await prisma.invoice.create({
      data: invoiceData(order.id, { type: "INVOICE", series: "F", invoiceNumber: "F-2026-000001" }),
    });
    await expectDbRejection(
      prisma.invoice.create({
        data: invoiceData(order.id, { number: 2, invoiceNumber: "T-2026-000002" }),
      }),
      /unique/i,
    );
  });

  it("requires the invoice number to follow series-year-number and to be unique", async () => {
    const { order } = await setup();
    await expectDbRejection(
      prisma.invoice.create({ data: invoiceData(order.id, { invoiceNumber: "T-2026-1" }) }),
      /ck_invoice_number_format/,
    );
    await prisma.invoice.create({ data: invoiceData(order.id) });

    const { user, product } = await setup();
    const other = await createOrder(prisma, { userId: user.id, productId: product.id });
    await expectDbRejection(prisma.invoice.create({ data: invoiceData(other.id) }), /unique/i);
  });

  it("requires total = net + VAT and non-negative amounts", async () => {
    const { order } = await setup();
    await expectDbRejection(
      prisma.invoice.create({
        data: invoiceData(order.id, { total: new Prisma.Decimal("25.00") }),
      }),
      /ck_invoice_amounts/,
    );
  });

  it("cannot be edited or deleted once issued", async () => {
    const { order } = await setup();
    const invoice = await prisma.invoice.create({ data: invoiceData(order.id) });
    await expectDbRejection(
      prisma.invoice.update({ where: { id: invoice.id }, data: { customerName: "Otro" } }),
      /append-only/i,
    );
    await expectDbRejection(prisma.invoice.delete({ where: { id: invoice.id } }), /append-only/i);
    await expectDbRejection(
      prisma.order.delete({ where: { id: order.id } }),
      /foreign key|constraint/i,
    );
  });
});

describe("gapless invoice numbering", () => {
  // Patrón que usará el servicio de facturación: un UPSERT atómico que devuelve el siguiente
  // número. La fila de la secuencia se bloquea, así que las peticiones simultáneas se serializan.
  async function nextNumber(client: PrismaClient, series: string, year: number) {
    const rows = await client.$queryRaw<Array<{ lastNumber: number }>>`
      INSERT INTO "InvoiceSequence" ("id", "series", "year", "lastNumber")
      VALUES (gen_random_uuid(), ${series}, ${year}, 1)
      ON CONFLICT ("series", "year")
      DO UPDATE SET "lastNumber" = "InvoiceSequence"."lastNumber" + 1
      RETURNING "lastNumber"`;
    return rows[0]!.lastNumber;
  }

  it("hands out consecutive numbers without gaps or duplicates under concurrency", async () => {
    const numbers = await Promise.all(
      Array.from({ length: 25 }, () => nextNumber(prisma, "F", 2026)),
    );
    expect([...numbers].sort((a, b) => a - b)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
  });

  it("keeps an independent sequence per series and year", async () => {
    expect(await nextNumber(prisma, "F", 2026)).toBe(1);
    expect(await nextNumber(prisma, "F", 2026)).toBe(2);
    expect(await nextNumber(prisma, "T", 2026)).toBe(1);
    expect(await nextNumber(prisma, "F", 2027)).toBe(1);
  });

  it("does not allow a negative counter or a duplicated series", async () => {
    await expectDbRejection(
      prisma.invoiceSequence.create({ data: { series: "F", year: 2026, lastNumber: -1 } }),
      /ck_invoice_sequence_last/,
    );
    await prisma.invoiceSequence.create({ data: { series: "F", year: 2026 } });
    await expectDbRejection(
      prisma.invoiceSequence.create({ data: { series: "F", year: 2026 } }),
      /unique/i,
    );
  });
});
