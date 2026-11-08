import { z } from "zod";

import type { PrismaClient } from "../../db/client.js";
import type { OrderStatus } from "../../generated/prisma/enums.js";
import { conflict, HttpError, notFound } from "../../errors.js";
import { earnPointsForOrder, lockOrder, reversePointsForOrder } from "../loyalty/ledger.service.js";

/**
 * Transiciones permitidas de un pedido. Todo lo que no esté aquí se rechaza. Los estados finales
 * son REJECTED y CANCELLED; un pedido COMPLETED solo puede pasar a CANCELLED (devolución), con motivo.
 */
const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING_PAYMENT: ["NEW", "CANCELLED"],
  NEW: ["ACCEPTED", "REJECTED", "CANCELLED"],
  ACCEPTED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["OUT_FOR_DELIVERY", "COMPLETED", "CANCELLED"],
  OUT_FOR_DELIVERY: ["COMPLETED", "CANCELLED"],
  COMPLETED: ["CANCELLED"],
  REJECTED: [],
  CANCELLED: [],
};

export const canTransition = (from: OrderStatus, to: OrderStatus) => TRANSITIONS[from].includes(to);

export const changeStatusSchema = z
  .object({
    status: z.enum([
      "NEW",
      "ACCEPTED",
      "PREPARING",
      "READY",
      "OUT_FOR_DELIVERY",
      "COMPLETED",
      "REJECTED",
      "CANCELLED",
    ]),
    reason: z.string().trim().min(3).max(300).optional(),
  })
  .strict();

export interface StatusChange {
  orderId: string;
  to: OrderStatus;
  /** Quien realiza el cambio (personal o cliente). */
  actorId: string;
  reason?: string;
}

/**
 * Cambia el estado de un pedido con todas sus consecuencias, en una sola transacción:
 * historial, fechas, estado del pago en efectivo y fidelización.
 *
 * - Completado: se cobra el efectivo y se conceden los puntos (una sola vez).
 * - Cancelado o rechazado: se anula el pago, se devuelven los puntos gastados en recompensas y se
 *   retiran los puntos ganados (hasta el saldo disponible).
 *
 * El pedido se bloquea durante el cambio: dos cambios simultáneos se ejecutan uno detrás de otro.
 */
export async function changeOrderStatus(
  prisma: PrismaClient,
  change: StatusChange,
  now = new Date(),
) {
  return prisma.$transaction(async (tx) => {
    await lockOrder(tx, change.orderId);
    const order = await tx.order.findUnique({
      where: { id: change.orderId },
      include: { payments: true },
    });
    if (!order) throw notFound("Order not found");

    const from = order.status;
    if (!canTransition(from, change.to)) {
      throw new HttpError(
        409,
        "INVALID_TRANSITION",
        `An order ${from} cannot become ${change.to}`,
        {
          from,
          to: change.to,
        },
      );
    }
    if (change.to === "OUT_FOR_DELIVERY" && order.type !== "DELIVERY") {
      throw new HttpError(
        409,
        "INVALID_TRANSITION",
        "Only delivery orders can go out for delivery",
        {
          from,
          to: change.to,
        },
      );
    }
    const needsReason =
      change.to === "REJECTED" || (from === "COMPLETED" && change.to === "CANCELLED");
    if (needsReason && !change.reason?.trim()) {
      throw new HttpError(422, "REASON_REQUIRED", "A reason is required for this change");
    }

    await tx.order.update({
      where: { id: order.id },
      data: {
        status: change.to,
        ...(change.to === "ACCEPTED" ? { acceptedAt: now } : {}),
        ...(change.to === "READY" ? { readyAt: now } : {}),
        ...(change.to === "COMPLETED" ? { completedAt: now } : {}),
        ...(change.to === "CANCELLED" || change.to === "REJECTED"
          ? { cancelledAt: now, cancellationReason: change.reason?.trim() || null }
          : {}),
      },
    });
    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: from,
        toStatus: change.to,
        changedById: change.actorId,
        reason: change.reason?.trim() || null,
      },
    });

    // Efectivo: se cobra al completar; si se anula, el pago pendiente se cancela y el cobrado se devuelve.
    for (const payment of order.payments.filter((item) => item.method !== "ONLINE")) {
      if (change.to === "COMPLETED" && payment.status === "CASH_PENDING") {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: "CASH_COLLECTED", paidAt: now },
        });
      } else if (change.to === "CANCELLED" || change.to === "REJECTED") {
        if (payment.status === "CASH_PENDING") {
          await tx.payment.update({ where: { id: payment.id }, data: { status: "CANCELLED" } });
        } else if (payment.status === "CASH_COLLECTED") {
          await tx.payment.update({
            where: { id: payment.id },
            data: { status: "REFUNDED", refundedAmount: payment.amount },
          });
        }
      }
    }

    let points = 0;
    if (change.to === "COMPLETED") {
      points = (await earnPointsForOrder(tx, order.id)).points;
    } else if (change.to === "CANCELLED" || change.to === "REJECTED") {
      await reversePointsForOrder(
        tx,
        order.id,
        change.reason?.trim() || `Order ${change.to.toLowerCase()}`,
      );
    }
    return { id: order.id, from, status: change.to, pointsGranted: points };
  });
}

/**
 * El cliente cancela su propio pedido, solo mientras el local aún no lo ha aceptado. Si el pedido
 * es de otra persona se responde 404, igual que si no existiera.
 */
export async function cancelMyOrder(prisma: PrismaClient, userId: string, orderId: string) {
  if (!z.uuid().safeParse(orderId).success) throw notFound("Order not found");
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId },
    select: { id: true, status: true },
  });
  if (!order) throw notFound("Order not found");
  if (order.status !== "NEW" && order.status !== "PENDING_PAYMENT") {
    throw conflict("CANNOT_CANCEL", "The order is already being prepared: contact the store");
  }
  return changeOrderStatus(prisma, {
    orderId: order.id,
    to: "CANCELLED",
    actorId: userId,
    reason: "Cancelado por el cliente",
  });
}
