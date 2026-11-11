import { z } from "zod";

import type { PrismaClient } from "../../db/client.js";
import { HttpError } from "../../errors.js";
import { clearCart } from "../cart/cart.service.js";
import { cartLinesSchema } from "../checkout/pricing.js";
import {
  couponCodeSchema,
  evaluateAutomaticPromotion,
  evaluateCoupon,
} from "../checkout/discounts.js";
import { computeOrder, orderTypeSchema } from "../checkout/totals.js";
import { isProfileComplete } from "../me/me.service.js";
import { usablePaymentMethods } from "../payments/availability.js";
import { localTime } from "../store/opening-hours.js";
import { asapAvailable, leadMinutes, listSlots, loadOpeningData } from "../store/scheduling.js";
import { orderEvents } from "../../events/order-events.js";
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
    /** Cupón promocional; el servidor valida fechas, límites y condiciones. */
    couponCode: couponCodeSchema.optional(),
    /** Recompensa ya canjeada (de «Mis recompensas») que se usa en este pedido. */
    redemptionId: z.uuid().optional(),
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
 * Pago: en efectivo el pedido queda «Nuevo» con un cobro pendiente. Online queda «Pendiente de pago»
 * (la cocina no lo ve) hasta que la pasarela confirma el cobro con un evento verificado; nunca se
 * marca como pagado por adelantado.
 */
export async function createOrder(
  prisma: PrismaClient,
  userId: string,
  body: unknown,
  now = new Date(),
  /** Pasarela de pago online (su nombre, p. ej. «stripe»). Sin ella, el pago online no existe. */
  options: { onlineProvider?: string | undefined } = {},
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
  const usable = usablePaymentMethods(
    settings.enabledPaymentMethods,
    Boolean(options.onlineProvider),
  );
  if (!usable.includes(input.paymentMethod)) {
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

  const computed = await computeOrder(
    prisma,
    {
      items: input.items,
      type: input.type,
      postalCode: address?.postalCode,
      couponCode: input.couponCode,
      redemptionId: input.redemptionId,
    },
    { userId, now },
  );
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

  const appliedCoupon = computed.discounts.find((discount) => discount.couponId);
  const appliedReward = computed.discounts.find((discount) => discount.rewardRedemptionId);
  const appliedAutomatic = computed.discounts.find(
    (discount) => discount.promotionId && !discount.couponId,
  );

  const initialStatus = input.paymentMethod === "ONLINE" ? "PENDING_PAYMENT" : "NEW";

  const orderId = await prisma.$transaction(async (tx) => {
    // Cupón: se bloquea su fila y se vuelven a comprobar los límites de uso dentro de la transacción,
    // de modo que dos pedidos simultáneos no pueden gastar el mismo cupón de un solo uso.
    if (appliedCoupon?.couponId) {
      await tx.$queryRaw`SELECT "id" FROM "Coupon" WHERE "id" = ${appliedCoupon.couponId}::uuid FOR UPDATE`;
      await evaluateCoupon(tx, {
        userId,
        code: input.couponCode ?? "",
        lines: computed.lines,
        subtotal: computed.subtotal,
        now,
      });
    }

    // Promoción automática: se bloquea y se vuelve a comprobar (límites de uso) dentro de la transacción.
    if (appliedAutomatic?.promotionId) {
      await tx.$queryRaw`SELECT "id" FROM "Promotion" WHERE "id" = ${appliedAutomatic.promotionId}::uuid FOR UPDATE`;
      const again = await evaluateAutomaticPromotion(tx, {
        userId,
        lines: computed.lines,
        subtotal: computed.subtotal,
        now,
      });
      if (
        again?.promotionId !== appliedAutomatic.promotionId ||
        !again.amount.equals(appliedAutomatic.amount)
      ) {
        throw new HttpError(409, "PROMOTION_CHANGED", "The promotion changed: review your order");
      }
    }

    const order = await tx.order.create({
      data: {
        userId,
        type: input.type,
        status: initialStatus,
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
        couponCode: appliedCoupon?.couponCode ?? null,
        discounts: {
          create: computed.discounts.map((discount) => ({
            description: discount.description,
            amount: discount.amount,
            promotionId: discount.promotionId ?? null,
            couponId: discount.couponId ?? null,
            rewardRedemptionId: discount.rewardRedemptionId ?? null,
          })),
        },
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
        statusHistory: {
          create: { fromStatus: null, toStatus: initialStatus, changedById: userId },
        },
        payments: {
          create: {
            method: input.paymentMethod,
            status: input.paymentMethod === "ONLINE" ? "PENDING" : "CASH_PENDING",
            ...(input.paymentMethod === "ONLINE"
              ? { provider: options.onlineProvider ?? null }
              : {}),
            amount: computed.total,
          },
        },
      },
    });
    if (appliedCoupon?.couponId) {
      await tx.couponRedemption.create({
        data: { couponId: appliedCoupon.couponId, userId, orderId: order.id },
      });
    }
    if (appliedReward?.rewardRedemptionId) {
      // Una recompensa solo se puede usar una vez: la actualización condicional lo garantiza.
      const used = await tx.rewardRedemption.updateMany({
        where: { id: appliedReward.rewardRedemptionId, userId, status: "AVAILABLE" },
        data: { status: "USED", usedAt: now, orderId: order.id },
      });
      if (used.count === 0) {
        throw new HttpError(409, "REDEMPTION_NOT_AVAILABLE", "This reward was already used");
      }
    }
    await clearCart(tx, userId);
    return order.id;
  });

  const created = await getMyOrder(prisma, userId, orderId);
  // Un pedido pendiente de pago no se anuncia: la cocina lo verá cuando se confirme el cobro.
  if (created.status === "NEW") {
    orderEvents.publish({
      kind: "created",
      orderId,
      orderNumber: created.orderNumber,
      status: created.status,
    });
  }
  return created;
}
