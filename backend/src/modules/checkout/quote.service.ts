import type { Prisma, PrismaClient } from "../../db/client.js";
import { computeOrder, quoteSchema } from "./totals.js";

const money = (value: Prisma.Decimal) => value.toFixed(2);

/**
 * Presupuesto del carrito: lo que se mostrará al cliente antes de confirmar. No guarda nada y no
 * necesita sesión. El pedido real recalcula todo otra vez al crearse.
 */
export async function quoteCart(prisma: PrismaClient, body: unknown, userId: string | null = null) {
  const input = quoteSchema.parse(body);
  const order = await computeOrder(prisma, input, { userId });
  const settings = await prisma.storeSettings.findUnique({ where: { id: 1 } });

  const delivery =
    input.type === "DELIVERY"
      ? {
          postalCode: input.postalCode ?? null,
          covered: order.zone !== null,
          zoneName: order.zone?.name ?? null,
          minimumOrder: order.zone ? money(order.zone.minimumOrder) : null,
          belowMinimum: order.zone
            ? order.subtotal.sub(order.discountTotal).lessThan(order.zone.minimumOrder)
            : false,
        }
      : null;

  const estimatedMinutes =
    input.type === "PICKUP"
      ? (settings?.prepTimeMinutes ?? null)
      : (order.zone?.estimatedMinutes ?? settings?.deliveryTimeMinutes ?? null);

  return {
    type: input.type,
    lines: order.lines.map((line) => ({
      productId: line.productId,
      productName: line.productName,
      quantity: line.quantity,
      notes: line.notes,
      unitPrice: money(line.unitPrice),
      lineTotal: money(line.lineTotal),
      options: line.options.map((option) => ({
        optionId: option.optionId,
        group: option.groupName,
        name: option.optionName,
        priceDelta: money(option.priceDelta),
      })),
    })),
    discounts: order.discounts.map((discount) => ({
      description: discount.description,
      amount: money(discount.amount),
    })),
    totals: {
      subtotal: money(order.subtotal),
      discount: money(order.discountTotal),
      deliveryFee: money(order.deliveryFee),
      tax: money(order.taxTotal),
      total: money(order.total),
    },
    delivery,
    estimatedMinutes,
    pointsToEarn: order.pointsToEarn,
  };
}
