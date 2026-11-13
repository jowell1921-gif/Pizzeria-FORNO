import { z } from "zod";

import type { Prisma, PrismaClient } from "../../db/client.js";
import { notFound } from "../../errors.js";
import { paginationMeta } from "../../utils/pagination.js";

/** Los importes viajan como cadenas decimales («12.50») para no perder precisión. */
const money = (value: Prisma.Decimal) => value.toFixed(2);

/**
 * Pedidos del usuario autenticado. Todas las consultas filtran por `userId`: un cliente nunca puede
 * ver pedidos de otro. Si el pedido existe pero es de otra persona se responde 404 (no 403), para no
 * revelar que existe.
 */
export async function listMyOrders(
  prisma: PrismaClient,
  userId: string,
  paging: { page: number; pageSize: number; skip: number; take: number },
) {
  const where = { userId };
  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: paging.skip,
      take: paging.take,
      include: { items: { select: { quantity: true } } },
    }),
    prisma.order.count({ where }),
  ]);

  return {
    data: rows.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      type: order.type,
      total: money(order.total),
      itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
      createdAt: order.createdAt.toISOString(),
    })),
    meta: paginationMeta(paging.page, paging.pageSize, total),
  };
}

/**
 * Un pedido del propio usuario con líneas, historial, pagos y descuentos. Si es de otra persona
 * responde como si no existiera.
 */
export async function getMyOrder(prisma: PrismaClient, userId: string, orderId: string) {
  if (!z.uuid().safeParse(orderId).success) throw notFound("Order not found");

  const order = await prisma.order.findFirst({
    where: { id: orderId, userId },
    include: {
      items: { include: { options: true }, orderBy: { productName: "asc" } },
      statusHistory: { orderBy: { createdAt: "asc" } },
      payments: { orderBy: { createdAt: "asc" } },
      discounts: true,
    },
  });
  if (!order) throw notFound("Order not found");

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    type: order.type,
    scheduledFor: order.scheduledFor?.toISOString() ?? null,
    estimatedReadyAt: order.estimatedReadyAt?.toISOString() ?? null,
    notes: order.notes,
    createdAt: order.createdAt.toISOString(),
    delivery:
      order.type === "DELIVERY"
        ? {
            name: order.deliveryName,
            line1: order.deliveryLine1,
            line2: order.deliveryLine2,
            postalCode: order.deliveryPostalCode,
            city: order.deliveryCity,
            notes: order.deliveryNotes,
          }
        : null,
    items: order.items.map((item) => ({
      id: item.id,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: money(item.unitPrice),
      lineTotal: money(item.lineTotal),
      options: item.options.map((option) => ({
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
    payments: order.payments.map((payment) => ({
      method: payment.method,
      status: payment.status,
      amount: money(payment.amount),
    })),
    // Historial de estados para que el cliente siga su pedido; sin datos del personal.
    history: order.statusHistory.map((entry) => ({
      status: entry.toStatus,
      at: entry.createdAt.toISOString(),
    })),
  };
}
