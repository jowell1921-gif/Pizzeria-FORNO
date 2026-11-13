import { findZoneForPostalCode } from "../delivery/postal-codes.js";
import { z } from "zod";

import { Prisma, type PrismaClient } from "../../db/client.js";
import {
  allocateDiscount,
  couponCodeSchema,
  evaluateDiscounts,
  type AppliedDiscount,
} from "./discounts.js";
import { cartLinesSchema, cents, priceLines, taxIncluded, type PricedLine } from "./pricing.js";

/**
 * IVA aplicado al gasto de envío. Simplificación aceptada por el propietario al ser una demostración: el
 * transporte cobrado junto con la venta sigue el tipo de la operación principal (10 % en comida
 * preparada); con tipos mezclados habría que prorratearlo (ver docs/decisions/0004-iva.md).
 */
export const DELIVERY_FEE_TAX_RATE = new Prisma.Decimal(10);

export const orderTypeSchema = z.enum(["PICKUP", "DELIVERY"]);

export const quoteSchema = z
  .object({
    items: cartLinesSchema,
    type: orderTypeSchema.default("PICKUP"),
    postalCode: z
      .string()
      .trim()
      .regex(/^[0-9]{5}$/, "Postal code must have 5 digits")
      .optional(),
    /** Cupón promocional (se valida en el servidor; exige sesión). */
    couponCode: couponCodeSchema.optional(),
    /** Recompensa ya canjeada que se quiere usar en este pedido (exige sesión). */
    redemptionId: z.uuid().optional(),
  })
  .strict();

export type QuoteInput = z.infer<typeof quoteSchema>;

type Zone = {
  id: string;
  name: string;
  deliveryFee: Prisma.Decimal;
  minimumOrder: Prisma.Decimal;
  estimatedMinutes: number;
};

export interface ComputedOrder {
  lines: PricedLine[];
  subtotal: Prisma.Decimal;
  discounts: AppliedDiscount[];
  discountTotal: Prisma.Decimal;
  deliveryFee: Prisma.Decimal;
  total: Prisma.Decimal;
  /** IVA contenido en el total (líneas y envío). */
  taxTotal: Prisma.Decimal;
  zone: Zone | null;
  /** Estimación de los puntos de FORNEA CLUB; la regla definitiva se aplica al completar el pedido. */
  pointsToEarn: number;
}

const ZERO = new Prisma.Decimal(0);

/**
 * Importes de un pedido, calculados siempre en el servidor: líneas, descuentos (cupón y recompensa,
 * validados aquí), envío, IVA contenido y total. Los descuentos exigen un usuario con sesión.
 */
export async function computeOrder(
  prisma: PrismaClient,
  input: QuoteInput,
  context: { userId: string | null; now?: Date } = { userId: null },
): Promise<ComputedOrder> {
  const lines = await priceLines(prisma, input.items);
  const subtotal = lines.reduce((sum, line) => sum.add(line.lineTotal), ZERO);
  const discounts = await evaluateDiscounts(prisma, {
    userId: context.userId,
    couponCode: input.couponCode,
    redemptionId: input.redemptionId,
    lines,
    subtotal,
    now: context.now ?? new Date(),
  });
  const discountTotal = discounts.reduce((sum, discount) => sum.add(discount.amount), ZERO);

  const zone =
    input.type === "DELIVERY" && input.postalCode
      ? findZoneForPostalCode(
          await prisma.deliveryZone.findMany({ where: { active: true, deletedAt: null } }),
          input.postalCode,
        )
      : null;
  const deliveryFee = input.type === "DELIVERY" && zone ? zone.deliveryFee : ZERO;

  const total = subtotal.sub(discountTotal).add(deliveryFee);
  // IVA contenido en lo que se paga: el descuento se reparte entre las líneas antes de extraer el IVA.
  const shares = allocateDiscount(lines, discountTotal);
  const taxTotal = lines
    .reduce(
      (sum, line, index) => sum.add(taxIncluded(line.lineTotal.sub(shares[index]!), line.taxRate)),
      ZERO,
    )
    .add(deliveryFee.greaterThan(ZERO) ? taxIncluded(deliveryFee, DELIVERY_FEE_TAX_RATE) : ZERO);

  const settings = await prisma.storeSettings.findUnique({ where: { id: 1 } });
  const perEuro = settings?.loyaltyPointsPerEuro ?? ZERO;
  // Los puntos se calculan sobre el importe de los productos tras descuentos, sin el envío.
  const pointsToEarn = cents(subtotal.sub(discountTotal)).mul(perEuro).floor().toNumber();

  return {
    lines,
    subtotal,
    discounts,
    discountTotal,
    deliveryFee,
    total,
    taxTotal: cents(taxTotal),
    zone,
    pointsToEarn,
  };
}
