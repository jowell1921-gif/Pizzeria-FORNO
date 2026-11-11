import PDFDocument from "pdfkit";

import type { Prisma } from "../../db/client.js";
import type { TaxLine } from "./invoice.service.js";

export interface PdfDocumentData {
  type: "INVOICE" | "RECEIPT";
  invoiceNumber: string;
  issuedAt: Date;
  timezone: string;
  customerName: string;
  customerTaxId: string | null;
  customerAddress: string | null;
  netTotal: Prisma.Decimal;
  taxTotal: Prisma.Decimal;
  total: Prisma.Decimal;
  taxBreakdown: TaxLine[];
  store: {
    name: string;
    legalName: string | null;
    taxId: string | null;
    address: string;
    phone: string;
    email: string;
  };
  order: {
    orderNumber: number;
    type: "PICKUP" | "DELIVERY";
    deliveryFee: Prisma.Decimal;
    discountTotal: Prisma.Decimal;
    paymentLabel: string;
    items: Array<{
      productName: string;
      quantity: number;
      unitPrice: Prisma.Decimal;
      lineTotal: Prisma.Decimal;
      options: string[];
    }>;
    discounts: Array<{ description: string; amount: Prisma.Decimal }>;
  };
}

const euro = (value: Prisma.Decimal | string) =>
  `${Number(value).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

const CHARCOAL = "#171717";
const TOMATO = "#D94A32";
const MUTED = "#666666";

/** Genera el PDF del ticket o la factura a partir de los datos guardados al emitirla. */
export function buildDocumentPdf(data: PdfDocumentData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 48,
      info: {
        Title: `${data.type === "INVOICE" ? "Factura" : "Ticket"} ${data.invoiceNumber}`,
        Author: data.store.legalName ?? data.store.name,
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;

    // Cabecera: emisor y título.
    doc.fillColor(TOMATO).font("Helvetica-Bold").fontSize(26).text(data.store.name, left, 48);
    doc.fillColor(CHARCOAL).font("Helvetica").fontSize(9);
    doc.text(data.store.legalName ?? data.store.name, left, 80);
    doc.text(data.store.taxId ? `NIF/CIF: ${data.store.taxId}` : "NIF/CIF: pendiente de indicar");
    doc.text(data.store.address);
    doc.text(`${data.store.phone} · ${data.store.email}`);

    doc.fillColor(CHARCOAL).font("Helvetica-Bold").fontSize(18);
    doc.text(data.type === "INVOICE" ? "FACTURA" : "TICKET", left, 48, {
      width,
      align: "right",
    });
    doc.font("Helvetica").fontSize(9).fillColor(MUTED);
    if (data.type === "RECEIPT") doc.text("Factura simplificada", { width, align: "right" });
    doc.fillColor(CHARCOAL).font("Helvetica-Bold").fontSize(11);
    doc.text(`Nº ${data.invoiceNumber}`, { width, align: "right" });
    doc.font("Helvetica").fontSize(9);
    doc.text(
      new Intl.DateTimeFormat("es-ES", {
        timeZone: data.timezone,
        dateStyle: "long",
        timeStyle: "short",
      }).format(data.issuedAt),
      { width, align: "right" },
    );
    doc.text(`Pedido #${data.order.orderNumber}`, { width, align: "right" });

    // Cliente.
    let y = 150;
    doc.moveTo(left, y).lineTo(right, y).strokeColor("#dddddd").stroke();
    y += 10;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(MUTED).text("CLIENTE", left, y);
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(CHARCOAL)
      .text(data.customerName, left, y + 12);
    if (data.customerTaxId) doc.text(`NIF/CIF: ${data.customerTaxId}`);
    if (data.customerAddress) doc.text(data.customerAddress, { width: width / 2 });

    // Líneas.
    y = Math.max(doc.y + 16, 230);
    const col = { name: left, qty: left + 290, unit: left + 350, total: left + 430 };
    doc.rect(left, y, width, 20).fill(CHARCOAL);
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(9);
    doc.text("Producto", col.name + 6, y + 6);
    doc.text("Cant.", col.qty, y + 6, { width: 50, align: "right" });
    doc.text("Precio", col.unit, y + 6, { width: 70, align: "right" });
    doc.text("Importe", col.total, y + 6, { width: width - 430 - 6, align: "right" });
    y += 26;

    doc.fillColor(CHARCOAL).font("Helvetica").fontSize(9);
    for (const item of data.order.items) {
      if (y > doc.page.height - 200) {
        doc.addPage();
        y = doc.page.margins.top;
      }
      doc.font("Helvetica-Bold").text(item.productName, col.name + 6, y, { width: 270 });
      const nameBottom = doc.y;
      if (item.options.length > 0) {
        doc
          .font("Helvetica")
          .fillColor(MUTED)
          .text(item.options.join(" · "), col.name + 6, nameBottom, {
            width: 270,
          });
        doc.fillColor(CHARCOAL);
      }
      const rowBottom = doc.y;
      doc.font("Helvetica").text(String(item.quantity), col.qty, y, { width: 50, align: "right" });
      doc.text(euro(item.unitPrice), col.unit, y, { width: 70, align: "right" });
      doc.text(euro(item.lineTotal), col.total, y, { width: width - 430 - 6, align: "right" });
      y = rowBottom + 8;
    }
    doc.moveTo(left, y).lineTo(right, y).strokeColor("#dddddd").stroke();
    y += 10;

    // Totales.
    const line = (label: string, value: string, bold = false) => {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 12 : 9);
      doc.fillColor(CHARCOAL).text(label, left + 250, y, { width: 150, align: "right" });
      doc.text(value, left + 410, y, { width: width - 410, align: "right" });
      y += bold ? 20 : 14;
    };
    for (const discount of data.order.discounts) {
      line(discount.description, `-${euro(discount.amount)}`);
    }
    if (data.order.deliveryFee.greaterThan(0))
      line("Gastos de envío", euro(data.order.deliveryFee));
    line("Total (IVA incluido)", euro(data.total), true);

    // Desglose del IVA.
    y += 12;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(MUTED).text("DESGLOSE DEL IVA", left, y);
    y += 14;
    doc.font("Helvetica").fillColor(CHARCOAL);
    doc.text("Tipo", left, y, { width: 80 });
    doc.text("Base imponible", left + 100, y, { width: 100, align: "right" });
    doc.text("Cuota", left + 220, y, { width: 80, align: "right" });
    y += 14;
    for (const tax of data.taxBreakdown) {
      doc.text(`${Number(tax.rate)} %`, left, y, { width: 80 });
      doc.text(euro(tax.base), left + 100, y, { width: 100, align: "right" });
      doc.text(euro(tax.tax), left + 220, y, { width: 80, align: "right" });
      y += 14;
    }
    doc.font("Helvetica-Bold");
    doc.text("Total", left, y, { width: 80 });
    doc.text(euro(data.netTotal), left + 100, y, { width: 100, align: "right" });
    doc.text(euro(data.taxTotal), left + 220, y, { width: 80, align: "right" });
    y += 24;

    doc.font("Helvetica").fontSize(9).fillColor(MUTED);
    doc.text(`Forma de pago: ${data.order.paymentLabel}`, left, y);
    doc.text(
      "Documento de un sitio de demostración: los datos del establecimiento, los importes y los impuestos son de ejemplo.",
      left,
      doc.page.height - 80,
      { width, align: "center" },
    );
    doc.end();
  });
}
