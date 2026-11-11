import { z } from "zod";

import type { PrismaClient } from "../../db/client.js";
import type { InvoiceType } from "../../generated/prisma/enums.js";
import { notFound } from "../../errors.js";
import { buildDocumentPdf } from "./invoice-pdf.js";
import { issueDocument, type TaxLine } from "./invoice.service.js";

const PAYMENT_LABELS = {
  ONLINE: "Tarjeta (pago online)",
  CASH_PICKUP: "Efectivo al recoger",
  CASH_DELIVERY: "Efectivo al recibir",
} as const;

export const documentTypeSchema = z
  .enum(["ticket", "invoice"])
  .transform((value): InvoiceType => (value === "ticket" ? "RECEIPT" : "INVOICE"));

/**
 * PDF del ticket o la factura de un pedido. El ticket se emite al pedirlo si el pedido ya está cobrado;
 * la factura debe haberse solicitado antes con los datos fiscales del cliente. Con `userId`, solo
 * si el pedido es del propio usuario.
 */
export async function renderDocumentPdf(
  prisma: PrismaClient,
  input: { orderId: string; type: InvoiceType; userId?: string },
) {
  const invoice =
    input.type === "RECEIPT"
      ? await issueDocument(prisma, input)
      : await prisma.invoice.findFirst({
          where: {
            orderId: input.orderId,
            type: "INVOICE",
            order: input.userId ? { userId: input.userId } : {},
          },
        });
  if (!invoice) throw notFound("Document not found");

  const [order, settings] = await Promise.all([
    prisma.order.findUniqueOrThrow({
      where: { id: invoice.orderId },
      include: {
        items: { include: { options: true }, orderBy: { productName: "asc" } },
        discounts: true,
        payments: true,
      },
    }),
    prisma.storeSettings.findUniqueOrThrow({ where: { id: 1 } }),
  ]);

  const pdf = await buildDocumentPdf({
    type: invoice.type,
    invoiceNumber: invoice.invoiceNumber,
    issuedAt: invoice.issuedAt,
    timezone: settings.timezone,
    customerName: invoice.customerName,
    customerTaxId: invoice.customerTaxId,
    customerAddress: invoice.customerAddress,
    netTotal: invoice.netTotal,
    taxTotal: invoice.taxTotal,
    total: invoice.total,
    taxBreakdown: invoice.taxBreakdown as unknown as TaxLine[],
    store: {
      name: settings.name,
      legalName: settings.legalName,
      taxId: settings.taxId,
      address: `${settings.addressLine}, ${settings.postalCode} ${settings.city}`,
      phone: settings.phone,
      email: settings.email,
    },
    order: {
      orderNumber: order.orderNumber,
      type: order.type,
      deliveryFee: order.deliveryFee,
      discountTotal: order.discountTotal,
      paymentLabel: PAYMENT_LABELS[order.payments[0]?.method ?? "CASH_PICKUP"],
      items: order.items.map((item) => ({
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
        options: item.options.map((option) => option.optionName),
      })),
      discounts: order.discounts.map((discount) => ({
        description: discount.description,
        amount: discount.amount,
      })),
    },
  });
  return {
    pdf,
    fileName: `${input.type === "INVOICE" ? "factura" : "ticket"}-${order.orderNumber}.pdf`,
  };
}
