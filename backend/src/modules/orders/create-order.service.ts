import { z } from "zod";

import type { PrismaClient } from "../../db/client.js";
import { HttpError } from "../../errors.js";
import { clearCart } from "../cart/cart.service.js";
import { cartLinesSchema } from "../checkout/pricing.js";
import { computeOrder, orderTypeSchema } from "../checkout/totals.js";
import { isProfileComplete } from "../me/me.service.js";
import { usablePaymentMethods } from "../payments/availability.js";
import { localTime } from "../store/opening-hours.js";
import { asapAvailable, leadMinutes, listSlots, loadOpeningData } from "../store/scheduling.js";
import { getMyOrder } from "./orders.service.js";

export const createOrderSchema = z
  .object({
    items: cartLinesSchema,
    type: orderTypeSchema,
    /** Dirección guardada del propio usuario (solo para entrega a domicilio). */
    addressId: z.uuid().optional(),
    /** Hora solicitada: debe ser una de las franjas de `GET /store/slots`. Sin ella, «lo antes posible». */
    scheduledFor: z.iso.datetime().optional(),
    paymentMethod: z.enum(["ONLINE", "CASH_PICKUP", "CASH_DELIVERY"]),
    notes: z.string().trim().max(300).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.type === "DELIVERY" && !value.addressId) {
      ctx.addIssue({
        code: "custom",
        path: ["addressId"],
        message: "A delivery address is required",
      });
    }
    if (value.type === "PICKUP" && value.addressId) {
      ctx.addIssue({
        code: "custom",
        path: ["addressId"],
        message: "Pickup orders have no address",
      });
    }
  });

const rejected = (code: string, message: string, details?: unknown) =>
  new HttpError(422, code, message, details);

/**
 * Crea un pedido para el usuario autenticado. Todo se decide aquí, nunca en el cliente:
 * precios, IVA, gastos de envío, mínimo del pedido, zona de reparto, horario, franja y método de pago.
 *
 * Pago: solo en efectivo mientras no haya un proveedor de pago online integrado (fase 9). El pedido
 * queda «Nuevo» con un pago de efectivo pendiente; nunca se marca como pagado por adelantado.
 */
export async function createOrder(
  prisma: PrismaClient,
  userId: string,
  body: unknown,
  now = new Date(),
) {
  const input = createOrderSchema.parse(body);

  const profile = await prisma.profile.findUnique({ where: { id: userId } });
  if (!profile || profile.deletedAt)
    throw new HttpError(403, "ACCOUNT_DISABLED", "This account is disabled");
  if (!isProfileComplete(profile)) {
    throw rejected("PROFILE_INCOMPLETE", "Complete your username and phone before ordering");
  }

  const settings = await prisma.storeSettings.findUnique({ where: { id: 1 } });
  if (!settings)
    throw new HttpError(503, "STORE_NOT_CONFIGURED", "The store is not configured yet");
  if (settings.ordersPaused) {
    throw new HttpError(
      409,
      "ORDERS_PAUSED",
      settings.pausedMessage ?? "Orders are paused right now",
    );
  }
  const typeEnabled = input.type === "PICKUP" ? settings.pickupEnabled : settings.deliveryEnabled;
  if (!typeEnabled) {
    throw new HttpError(
      409,
      "ORDER_TYPE_UNAVAILABLE",
      "This order type is not available right now",
    );
  }

  // Método de pago: debe estar activo, usable y ser coherente con la modalidad.
  if (!usablePaymentMethods(settings.enabledPaymentMethods).includes(input.paymentMethod)) {
    throw new HttpError(409, "PAYMENT_METHOD_UNAVAILABLE", "This payment method is not available");
  }
  const cashFor = { PICKUP: "CASH_PICKUP", DELIVERY: "CASH_DELIVERY" } as const;
  if (input.paymentMethod !== "ONLINE" && input.paymentMethod !== cashFor[input.type]) {
    throw rejected("PAYMENT_METHOD_MISMATCH", "This payment method does not match the order type");
  }

  const address =
    input.type === "DELIVERY"
      ? await prisma.address.findFirst({ where: { id: input.addressId, userId, deletedAt: null } })
      : null;
  if (input.type === "DELIVERY" && !address) {
    throw rejected("ADDRESS_NOT_FOUND", "The delivery address does not exist");
  }

  const computed = await computeOrder(prisma, {
    items: input.items,
    type: input.type,
    postalCode: address?.postalCode,
  });
  if (input.type === "DELIVERY" && !computed.zone) {
    throw rejected("OUTSIDE_DELIVERY_ZONE", "We do not deliver to this postal code");
  }
  const payable = computed.subtotal.sub(computed.discountTotal);
  if (computed.zone && payable.lessThan(computed.zone.minimumOrder)) {
    throw rejected("BELOW_MINIMUM_ORDER", "The order is below the minimum for this zone", {
      minimumOrder: computed.zone.minimumOrder.toFixed(2),
    });
  }
  if (computed.total.lessThanOrEqualTo(0)) {
    throw rejected("INVALID_ORDER_TOTAL", "The order total is not valid");
  }

  // Horario: franja concreta o «lo antes posible» con el local abierto.
  const today = localTime(now, settings.timezone).date;
  const opening = await loadOpeningData(prisma, today);
  let scheduledFor: Date | null = null;
  if (input.scheduledFor) {
    const requested = new Date(input.scheduledFor);
    const slots = listSlots(
      settings,
      opening,
      input.type,
      localTime(requested, settings.timezone).date,
      now,
    );
    if (!slots.some((slot) => slot.getTime() === requested.getTime())) {
      throw rejected("INVALID_SCHEDULE", "The requested time is not available");
    }
    scheduledFor = requested;
  } else if (!asapAvailable(settings, opening, now)) {
    throw new HttpError(409, "STORE_CLOSED", "The store is closed now: choose a time slot");
  }
  const lead = computed.zone?.estimatedMinutes ?? leadMinutes(settings, input.type);
  const estimatedReadyAt = scheduledFor ?? new Date(now.getTime() + lead * 60_000);

  const orderId = await prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        userId,
        type: input.type,
        status: "NEW",
        scheduledFor,
        estimatedReadyAt,
        notes: input.notes || null,
        customerName: profile.fullName,
        customerEmail: profile.email,
        customerPhone: profile.phone,
        ...(address && computed.zone
          ? {
              deliveryName: address.recipientName,
              deliveryLine1: address.line1,
              deliveryLine2: address.line2,
              deliveryPostalCode: address.postalCode,
              deliveryCity: address.city,
              deliveryNotes: address.notes,
              deliveryZoneId: computed.zone.id,
              deliveryZoneName: computed.zone.name,
            }
          : {}),
        subtotal: computed.subtotal,
        discountTotal: computed.discountTotal,
        deliveryFee: computed.deliveryFee,
        total: computed.total,
        taxTotal: computed.taxTotal,
        items: {
          create: computed.lines.map((line) => ({
            productId: line.productId,
            productName: line.productName,
            unitPrice: line.unitPrice,
            quantity: line.quantity,
            taxRate: line.taxRate,
            lineTotal: line.lineTotal,
            taxAmount: line.taxAmount,
            notes: line.notes,
            options: {
              create: line.options.map((option) => ({
                optionId: option.optionId,
                groupName: option.groupName,
                optionName: option.optionName,
                priceDelta: option.priceDelta,
              })),
            },
          })),
        },
        statusHistory: { create: { fromStatus: null, toStatus: "NEW", changedById: userId } },
        payments: {
          create: {
            method: input.paymentMethod,
            status: "CASH_PENDING",
            amount: computed.total,
          },
        },
      },
    });
    await clearCart(tx, userId);
    return order.id;
  });

  return getMyOrder(prisma, userId, orderId);
}
