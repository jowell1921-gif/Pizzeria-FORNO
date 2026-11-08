import { z } from "zod";

import { Prisma, type PrismaClient } from "../../db/client.js";
import { HttpError } from "../../errors.js";

export const MAX_LINE_QUANTITY = 20;
export const MAX_CART_LINES = 30;

/** Una línea del carrito tal como la envía el cliente: solo identificadores y cantidades, nunca precios. */
export const cartLineSchema = z
  .object({
    productId: z.uuid(),
    quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY),
    optionIds: z.array(z.uuid()).max(30).default([]),
    notes: z.string().trim().max(200).nullable().optional(),
  })
  .strict();

export const cartLinesSchema = z.array(cartLineSchema).min(1).max(MAX_CART_LINES);

export type CartLineInput = z.infer<typeof cartLineSchema>;

export interface PricedLine {
  productId: string;
  productName: string;
  quantity: number;
  notes: string | null;
  taxRate: Prisma.Decimal;
  /** Precio unitario con opciones, IVA incluido. */
  unitPrice: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  /** IVA contenido en la línea. */
  taxAmount: Prisma.Decimal;
  options: Array<{
    optionId: string;
    groupName: string;
    optionName: string;
    priceDelta: Prisma.Decimal;
  }>;
}

const ZERO = new Prisma.Decimal(0);

/** Redondeo a céntimos «half up», igual que `round()` de PostgreSQL. */
export const cents = (value: Prisma.Decimal) =>
  value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

/** IVA contenido en un importe con IVA incluido: total · tasa / (100 + tasa). */
export const taxIncluded = (total: Prisma.Decimal, rate: Prisma.Decimal) =>
  cents(total.mul(rate).div(rate.add(100)));

const invalid = (code: string, message: string, details?: unknown) =>
  new HttpError(422, code, message, details);

/**
 * Calcula el precio de las líneas del carrito a partir de los datos de la base de datos. El cliente
 * solo indica qué producto y qué opciones quiere: el precio, el IVA y la disponibilidad se
 * determinan aquí, de modo que no se pueden manipular desde el navegador ni desde la app.
 */
export async function priceLines(
  prisma: Pick<PrismaClient, "product">,
  lines: readonly CartLineInput[],
): Promise<PricedLine[]> {
  const productIds = [...new Set(lines.map((line) => line.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, deletedAt: null, category: { active: true, deletedAt: null } },
    include: {
      optionGroups: {
        include: { options: { where: { deletedAt: null } } },
      },
    },
  });
  const byId = new Map(products.map((product) => [product.id, product]));

  return lines.map((line, index) => {
    const product = byId.get(line.productId);
    if (!product) {
      throw invalid("PRODUCT_NOT_FOUND", "A product in the order does not exist", { line: index });
    }
    if (!product.available) {
      throw invalid("PRODUCT_UNAVAILABLE", `${product.name} is not available`, { line: index });
    }

    const wanted = new Set(line.optionIds);
    if (wanted.size !== line.optionIds.length) {
      throw invalid("INVALID_OPTIONS", "An option is repeated", { line: index });
    }

    const selected: PricedLine["options"] = [];
    for (const group of product.optionGroups) {
      const chosen = group.options.filter((option) => wanted.has(option.id));
      const minimum = Math.max(group.minSelect, group.required ? 1 : 0);
      if (chosen.length < minimum || chosen.length > group.maxSelect) {
        throw invalid("INVALID_OPTIONS", `Invalid selection for "${group.name}"`, {
          line: index,
          group: group.name,
        });
      }
      for (const option of chosen) {
        if (!option.available) {
          throw invalid("OPTION_UNAVAILABLE", `${option.name} is not available`, { line: index });
        }
        wanted.delete(option.id);
        selected.push({
          optionId: option.id,
          groupName: group.name,
          optionName: option.name,
          priceDelta: option.priceDelta,
        });
      }
    }
    // Quedan identificadores que no pertenecen a este producto.
    if (wanted.size > 0) {
      throw invalid("INVALID_OPTIONS", "An option does not belong to the product", { line: index });
    }

    const unitPrice = selected.reduce(
      (sum, option) => sum.add(option.priceDelta),
      product.basePrice,
    );
    if (unitPrice.lessThan(ZERO)) {
      throw invalid("INVALID_OPTIONS", "The resulting price is not valid", { line: index });
    }
    const lineTotal = cents(unitPrice.mul(line.quantity));

    return {
      productId: product.id,
      productName: product.name,
      quantity: line.quantity,
      notes: line.notes?.trim() || null,
      taxRate: product.taxRate,
      unitPrice: cents(unitPrice),
      lineTotal,
      taxAmount: taxIncluded(lineTotal, product.taxRate),
      options: selected,
    };
  });
}
