import { z } from "zod";

import type { Prisma, PrismaClient } from "../../db/client.js";
import { notFound } from "../../errors.js";
import { paginationMeta } from "../../utils/pagination.js";
import { nextStatuses } from "../orders/status.service.js";
import { localTime } from "../store/opening-hours.js";
import { zonedTimeToUtc } from "../store/scheduling.js";

const money = (value: Prisma.Decimal) => value.toFixed(2);

const STATUSES = [
  "PENDING_PAYMENT",
  "NEW",
  "ACCEPTED",
  "PREPARING",
  "READY",
  "OUT_FOR_DELIVERY",
  "COMPLETED",
  "REJECTED",
  "CANCELLED",
] as const;

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

export const adminOrdersQuerySchema = z.object({
  /** Uno o varios estados separados por comas. */
  status: z
    .string()
    .transform((value) => value.split(",").filter(Boolean))
    .pipe(z.array(z.enum(STATUSES)).max(STATUSES.length))
    .optional(),
  type: z.enum(["PICKUP", "DELIVERY"]).optional(),
  /** Día (fecha local del local) en que se hizo el pedido. */
  date: date.optional(),
  /** Número de pedido o parte del nombre o correo del cliente. */
  q: z.string().trim().min(1).max(80).optional(),
});

/** Inicio y fin (UTC) de un día en la zona horaria del local. */
export function dayRange(day: string, timeZone: string) {
  const start = zonedTimeToUtc(day, 0, timeZone);
  const next = new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  return { start, end: zonedTimeToUtc(next, 0, timeZone) };
}

export async function storeTimeZone(prisma: Pick<PrismaClient, "storeSettings">) {
  const settings = await prisma.storeSettings.findUnique({
    where: { id: 1 },
    select: { timezone: true },
  });
  return settings?.timezone ?? "Europe/Madrid";
}

/** Lista de pedidos para el personal, con filtros y paginación (más recientes primero). */
export async function listAdminOrders(
  prisma: PrismaClient,
  query: unknown,
  paging: { page: number; pageSize: number; skip: number; take: number },
  options: { includePayments: boolean },
) {
  const filters = adminOrdersQuerySchema.parse(query);
  const timeZone = await storeTimeZone(prisma);

  const where: Prisma.OrderWhereInput = {
    ...(filters.status ? { status: { in: filters.status } } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.date
      ? (() => {
          const range = dayRange(filters.date, timeZone);
          return { placedAt: { gte: range.start, lt: range.end } };
        })()
      : {}),
  };
  if (filters.q) {
    const number = /^\d{1,9}$/.test(filters.q) ? Number(filters.q) : null;
    where.OR = [
      ...(number !== null ? [{ orderNumber: number }] : []),
      { customerName: { contains: filters.q, mode: "insensitive" } },
      { customerEmail: { contains: filters.q, mode: "insensitive" } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { placedAt: "desc" },
      skip: paging.skip,
      take: paging.take,
      include: {
        items: { select: { quantity: true } },
        payments: { select: { method: true, status: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);

  return {
    data: rows.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      type: order.type,
      customerName: order.customerName,
      total: money(order.total),
      itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
      placedAt: order.placedAt.toISOString(),
      scheduledFor: order.scheduledFor?.toISOString() ?? null,
      payment: options.includePayments
        ? { method: order.payments[0]?.method ?? null, status: order.payments[0]?.status ?? null }
        : null,
    })),
    meta: paginationMeta(paging.page, paging.pageSize, total),
  };
}

/** Detalle completo de un pedido para el personal. Los pagos solo si tiene permiso de pagos. */
export async function getAdminOrder(
  prisma: PrismaClient,
  orderId: string,
  options: { includePayments: boolean },
) {
  if (!z.uuid().safeParse(orderId).success) throw notFound("Order not found");
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: { include: { options: true }, orderBy: { productName: "asc" } },
      discounts: true,
      payments: { orderBy: { createdAt: "asc" } },
      statusHistory: {
        orderBy: { createdAt: "asc" },
        include: { changedBy: { select: { fullName: true } } },
      },
    },
  });
  if (!order) throw notFound("Order not found");

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    type: order.type,
    placedAt: order.placedAt.toISOString(),
    scheduledFor: order.scheduledFor?.toISOString() ?? null,
    estimatedReadyAt: order.estimatedReadyAt?.toISOString() ?? null,
    notes: order.notes,
    cancellationReason: order.cancellationReason,
    couponCode: order.couponCode,
    customer: { name: order.customerName, email: order.customerEmail, phone: order.customerPhone },
    delivery:
      order.type === "DELIVERY"
        ? {
            name: order.deliveryName,
            line1: order.deliveryLine1,
            line2: order.deliveryLine2,
            postalCode: order.deliveryPostalCode,
            city: order.deliveryCity,
            notes: order.deliveryNotes,
            zone: order.deliveryZoneName,
          }
        : null,
    items: order.items.map((item) => ({
      id: item.id,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: money(item.unitPrice),
      lineTotal: money(item.lineTotal),
      notes: item.notes,
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
    payments: options.includePayments
      ? order.payments.map((payment) => ({
          method: payment.method,
          status: payment.status,
          amount: money(payment.amount),
          paidAt: payment.paidAt?.toISOString() ?? null,
        }))
      : null,
    history: order.statusHistory.map((entry) => ({
      from: entry.fromStatus,
      status: entry.toStatus,
      at: entry.createdAt.toISOString(),
      by: entry.changedBy?.fullName ?? null,
      reason: entry.reason,
    })),
    /** Estados a los que se puede pasar desde el actual (para mostrar solo los botones válidos). */
    allowedNext: nextStatuses({ status: order.status, type: order.type }),
  };
}

/** Pedidos del día y su estado actual, para el panel de control. */
export async function getDashboard(prisma: PrismaClient, now = new Date()) {
  const timeZone = await storeTimeZone(prisma);
  const today = localTime(now, timeZone).date;
  const range = dayRange(today, timeZone);
  const weekStart = dayRange(
    new Date(Date.parse(`${today}T00:00:00Z`) - 6 * 86_400_000).toISOString().slice(0, 10),
    timeZone,
  ).start;
  const todayWhere = { placedAt: { gte: range.start, lt: range.end } };

  const [byStatus, completedSales, activeSales, popular, recent] = await Promise.all([
    prisma.order.groupBy({ by: ["status"], where: todayWhere, _count: { _all: true } }),
    prisma.order.aggregate({
      where: { ...todayWhere, status: "COMPLETED" },
      _sum: { total: true },
    }),
    prisma.order.aggregate({
      where: { ...todayWhere, status: { notIn: ["CANCELLED", "REJECTED", "COMPLETED"] } },
      _sum: { total: true },
    }),
    prisma.orderItem.groupBy({
      by: ["productName"],
      where: {
        order: { placedAt: { gte: weekStart }, status: { notIn: ["CANCELLED", "REJECTED"] } },
      },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 5,
    }),
    prisma.order.findMany({
      orderBy: { placedAt: "desc" },
      take: 8,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        type: true,
        total: true,
        placedAt: true,
        customerName: true,
      },
    }),
  ]);

  const count = (...statuses: string[]) =>
    byStatus
      .filter((row) => statuses.includes(row.status))
      .reduce((sum, row) => sum + row._count._all, 0);
  const all = byStatus.reduce((sum, row) => sum + row._count._all, 0);
  const completed = count("COMPLETED");

  return {
    date: today,
    orders: {
      total: all,
      pending: count("PENDING_PAYMENT", "NEW"),
      preparing: count("ACCEPTED", "PREPARING"),
      ready: count("READY", "OUT_FOR_DELIVERY"),
      completed,
      cancelled: count("CANCELLED", "REJECTED"),
    },
    sales: {
      completed: money(completedSales._sum.total ?? (0 as unknown as Prisma.Decimal)),
      inProgress: money(activeSales._sum.total ?? (0 as unknown as Prisma.Decimal)),
      averageTicket:
        completed > 0 ? (Number(completedSales._sum.total ?? 0) / completed).toFixed(2) : "0.00",
    },
    popularProducts: popular.map((row) => ({
      name: row.productName,
      quantity: row._sum.quantity ?? 0,
    })),
    recentOrders: recent.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      type: order.type,
      customerName: order.customerName,
      total: money(order.total),
      placedAt: order.placedAt.toISOString(),
    })),
  };
}
