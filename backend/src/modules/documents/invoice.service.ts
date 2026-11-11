import { z } from "zod";

import { Prisma, type PrismaClient } from "../../db/client.js";
import type { InvoiceType } from "../../generated/prisma/enums.js";
import { conflict, notFound } from "../../errors.js";
import { allocateDiscount } from "../checkout/discounts.js";
import { taxIncluded } from "../checkout/pricing.js";
import { DELIVERY_FEE_TAX_RATE } from "../checkout/totals.js";
import { lockOrder } from "../loyalty/ledger.service.js";
import { localTime } from "../store/opening-hours.js";

/**
 * Tickets (factura simplificada) y facturas. Se emiten solo cuando el pedido está cobrado (pago online
 * confirmado o efectivo recogido), con numeración correlativa por serie y año, y no se pueden modificar
 * una vez emitidos (la base de datos lo impide). El ticket se emite al pedirlo; la factura, con los
 * datos fiscales del cliente, solo si el cliente la solicita.
 */
const SERIES: Record<InvoiceType, string> = { RECEIPT: "T", INVOICE: "F" };

const SETTLED = ["PAID", "CASH_COLLECTED", "PARTIALLY_REFUNDED", "REFUNDED"] as const;

export const invoiceRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    taxId: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{5,20}$/, "Invalid tax id"),
    address: z.string().trim().min(5).max(200),
  })
  .strict();

export type InvoiceRequest = z.infer<typeof invoiceRequestSchema>;

export interface TaxLine {
  rate: string;
  base: string;
  tax: string;
}

/** Desglose del IVA contenido en el pedido, por tipo. Suma exactamente el IVA del pedido. */
export function taxBreakdown(order: {
  items: Array<{ lineTotal: Prisma.Decimal; taxRate: Prisma.Decimal }>;
  discountTotal: Prisma.Decimal;
  deliveryFee: Prisma.Decimal;
}): TaxLine[] {
  const shares = allocateDiscount(order.items, order.discountTotal);
  const groups = new Map<string, { gross: Prisma.Decimal; tax: Prisma.Decimal }>();
  const add = (rate: Prisma.Decimal, gross: Prisma.Decimal) => {
    const key = rate.toFixed(2);
    const current = groups.get(key) ?? { gross: new Prisma.Decimal(0), tax: new Prisma.Decimal(0) };
    groups.set(key, {
      gross: current.gross.add(gross),
      tax: current.tax.add(taxIncluded(gross, rate)),
    });
  };
  order.items.forEach((item, index) => add(item.taxRate, item.lineTotal.sub(shares[index]!)));
  if (order.deliveryFee.greaterThan(0)) add(DELIVERY_FEE_TAX_RATE, order.deliveryFee);

  return [...groups.entries()]
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([rate, group]) => ({
      rate,
      base: group.gross.sub(group.tax).toFixed(2),
      tax: group.tax.toFixed(2),
    }));
}

const view = (invoice: {
  type: InvoiceType;
  invoiceNumber: string;
  issuedAt: Date;
  total: Prisma.Decimal;
}) => ({
  type: invoice.type,
  number: invoice.invoiceNumber,
  issuedAt: invoice.issuedAt.toISOString(),
  total: invoice.total.toFixed(2),
});

/** Documentos ya emitidos de un pedido y si se puede emitir el ticket. */
export async function listDocuments(prisma: PrismaClient, orderId: string, userId?: string) {
  if (!z.uuid().safeParse(orderId).success) throw notFound("Order not found");
  const order = await prisma.order.findFirst({
    where: { id: orderId, ...(userId ? { userId } : {}) },
    include: { invoices: { orderBy: { issuedAt: "asc" } }, payments: true },
  });
  if (!order) throw notFound("Order not found");
  const settled = order.payments.some((payment) =>
    (SETTLED as readonly string[]).includes(payment.status),
  );
  return { settled, documents: order.invoices.map(view) };
}

/**
 * Emite (o devuelve, si ya existe) el documento del pedido. Con `userId`, solo si el pedido es suyo.
 * Es idempotente y seguro ante peticiones simultáneas: el pedido se bloquea y la numeración se
 * incrementa de forma atómica dentro de la misma transacción.
 */
export async function issueDocument(
  prisma: PrismaClient,
  input: {
    orderId: string;
    userId?: string;
    type: InvoiceType;
    customer?: InvoiceRequest;
    now?: Date;
  },
) {
  if (!z.uuid().safeParse(input.orderId).success) throw notFound("Order not found");
  const now = input.now ?? new Date();

  return prisma.$transaction(async (tx) => {
    await lockOrder(tx, input.orderId);
    const order = await tx.order.findFirst({
      where: { id: input.orderId, ...(input.userId ? { userId: input.userId } : {}) },
      include: { items: true, payments: true },
    });
    if (!order) throw notFound("Order not found");

    const existing = await tx.invoice.findUnique({
      where: { orderId_type: { orderId: order.id, type: input.type } },
    });
    if (existing) return existing;

    if (!order.payments.some((p) => (SETTLED as readonly string[]).includes(p.status))) {
      throw conflict("DOCUMENT_NOT_AVAILABLE", "The order has not been paid yet");
    }
    if (input.type === "INVOICE" && !input.customer) {
      throw conflict("CUSTOMER_DATA_REQUIRED", "The customer tax data is required");
    }

    const settings = await tx.storeSettings.findUniqueOrThrow({ where: { id: 1 } });
    const series = SERIES[input.type];
    const year = Number(localTime(now, settings.timezone).date.slice(0, 4));
    // Contador atómico por serie y año: sin saltos ni duplicados aunque haya peticiones simultáneas.
    const rows = await tx.$queryRaw<Array<{ lastNumber: number }>>`
      INSERT INTO "InvoiceSequence" ("id", "series", "year", "lastNumber")
      VALUES (gen_random_uuid(), ${series}, ${year}, 1)
      ON CONFLICT ("series", "year")
      DO UPDATE SET "lastNumber" = "InvoiceSequence"."lastNumber" + 1
      RETURNING "lastNumber"`;
    const number = rows[0]!.lastNumber;

    const breakdown = taxBreakdown(order);
    return tx.invoice.create({
      data: {
        orderId: order.id,
        type: input.type,
        series,
        year,
        number,
        invoiceNumber: `${series}-${year}-${String(number).padStart(6, "0")}`,
        issuedAt: now,
        customerName: input.customer?.name ?? order.customerName,
        customerTaxId: input.customer?.taxId ?? null,
        customerAddress: input.customer?.address ?? null,
        netTotal: order.total.sub(order.taxTotal),
        taxTotal: order.taxTotal,
        total: order.total,
        taxBreakdown: breakdown as unknown as Prisma.InputJsonValue,
      },
    });
  });
}

export { view as documentView };
