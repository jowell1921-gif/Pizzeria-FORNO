import { z } from "zod";

import { orderSummarySchema } from "@/features/account/orders";
import { apiRequest, apiRequestPage } from "@/lib/api";

const status = orderSummarySchema.shape.status;
const orderType = z.enum(["PICKUP", "DELIVERY"]);
const paymentMethod = z.enum(["ONLINE", "CASH_PICKUP", "CASH_DELIVERY"]);

export type OrderStatus = z.infer<typeof status>;

export const adminOrderSummarySchema = z.object({
  id: z.string(),
  orderNumber: z.number(),
  status,
  type: orderType,
  customerName: z.string(),
  total: z.string(),
  itemCount: z.number(),
  placedAt: z.string(),
  scheduledFor: z.string().nullable(),
  payment: z.object({ method: paymentMethod.nullable(), status: z.string().nullable() }).nullable(),
});

export const adminOrderSchema = z.object({
  id: z.string(),
  orderNumber: z.number(),
  status,
  type: orderType,
  placedAt: z.string(),
  scheduledFor: z.string().nullable(),
  estimatedReadyAt: z.string().nullable(),
  notes: z.string().nullable(),
  cancellationReason: z.string().nullable(),
  couponCode: z.string().nullable(),
  customer: z.object({ name: z.string(), email: z.string(), phone: z.string().nullable() }),
  delivery: z
    .object({
      name: z.string().nullable(),
      line1: z.string().nullable(),
      line2: z.string().nullable(),
      postalCode: z.string().nullable(),
      city: z.string().nullable(),
      notes: z.string().nullable(),
      zone: z.string().nullable(),
    })
    .nullable(),
  items: z.array(
    z.object({
      id: z.string(),
      productName: z.string(),
      quantity: z.number(),
      unitPrice: z.string(),
      lineTotal: z.string(),
      notes: z.string().nullable(),
      options: z.array(z.object({ group: z.string(), name: z.string(), priceDelta: z.string() })),
    }),
  ),
  discounts: z.array(z.object({ description: z.string(), amount: z.string() })),
  totals: z.object({
    subtotal: z.string(),
    discount: z.string(),
    deliveryFee: z.string(),
    tax: z.string(),
    total: z.string(),
  }),
  payments: z
    .array(
      z.object({
        method: paymentMethod,
        status: z.string(),
        amount: z.string(),
        refundedAmount: z.string().default("0.00"),
        failureReason: z.string().nullable().default(null),
        paidAt: z.string().nullable(),
      }),
    )
    .nullable(),
  history: z.array(
    z.object({
      from: status.nullable(),
      status,
      at: z.string(),
      by: z.string().nullable(),
      reason: z.string().nullable(),
    }),
  ),
  allowedNext: z.array(status),
});

export const kitchenOrderSchema = z.object({
  id: z.string(),
  orderNumber: z.number(),
  status,
  type: orderType,
  placedAt: z.string(),
  scheduledFor: z.string().nullable(),
  estimatedReadyAt: z.string().nullable(),
  notes: z.string().nullable(),
  items: z.array(
    z.object({
      quantity: z.number(),
      name: z.string(),
      options: z.array(z.string()),
      notes: z.string().nullable(),
    }),
  ),
});

export const dashboardSchema = z.object({
  date: z.string(),
  orders: z.object({
    total: z.number(),
    pending: z.number(),
    preparing: z.number(),
    ready: z.number(),
    completed: z.number(),
    cancelled: z.number(),
  }),
  sales: z.object({ completed: z.string(), inProgress: z.string(), averageTicket: z.string() }),
  popularProducts: z.array(z.object({ name: z.string(), quantity: z.number() })),
  recentOrders: z.array(
    z.object({
      id: z.string(),
      orderNumber: z.number(),
      status,
      type: orderType,
      customerName: z.string(),
      total: z.string(),
      placedAt: z.string(),
    }),
  ),
});

export type AdminOrderSummary = z.infer<typeof adminOrderSummarySchema>;
export type AdminOrder = z.infer<typeof adminOrderSchema>;
export type KitchenOrder = z.infer<typeof kitchenOrderSchema>;
export type Dashboard = z.infer<typeof dashboardSchema>;

export interface OrderFilters {
  status?: string;
  type?: string;
  date?: string;
  q?: string;
  page?: number;
}

export const PAGE_SIZE = 15;

export const fetchDashboard = (token: string) =>
  apiRequest("/admin/dashboard", { token, schema: dashboardSchema });

export const fetchAdminOrders = (token: string, filters: OrderFilters) =>
  apiRequestPage("/admin/orders", {
    token,
    query: {
      page: filters.page ?? 1,
      pageSize: PAGE_SIZE,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.date ? { date: filters.date } : {}),
      ...(filters.q ? { q: filters.q } : {}),
    },
    schema: adminOrderSummarySchema,
  });

export const fetchAdminOrder = (token: string, id: string) =>
  apiRequest(`/admin/orders/${encodeURIComponent(id)}`, { token, schema: adminOrderSchema });

export const changeAdminOrderStatus = (
  token: string,
  id: string,
  body: { status: OrderStatus; reason?: string },
) =>
  apiRequest(`/admin/orders/${encodeURIComponent(id)}/status`, {
    token,
    method: "PATCH",
    body,
    schema: adminOrderSchema,
  });

/** Reembolso (total o parcial) de un pago online ya cobrado. Permiso `payments:refund`. */
export const refundAdminOrder = (
  token: string,
  id: string,
  body: { amount?: string; reason: string },
) =>
  apiRequest(`/admin/orders/${encodeURIComponent(id)}/refund`, {
    token,
    method: "POST",
    body,
    // La pantalla vuelve a cargar el pedido; la respuesta no se usa.
    schema: z.unknown(),
  });

export const fetchKitchenOrders = (token: string) =>
  apiRequest("/kitchen/orders", { token, schema: z.array(kitchenOrderSchema) });

export const changeKitchenOrderStatus = (token: string, id: string, status: OrderStatus) =>
  apiRequest(`/kitchen/orders/${encodeURIComponent(id)}/status`, {
    token,
    method: "PATCH",
    body: { status },
    schema: kitchenOrderSchema,
  });

/** Acción que representa pasar a cada estado, en el idioma del personal. */
export const STATUS_ACTION_LABELS: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Pendiente de pago",
  NEW: "Volver a nuevo",
  ACCEPTED: "Aceptar pedido",
  PREPARING: "Empezar a preparar",
  READY: "Marcar como listo",
  OUT_FOR_DELIVERY: "Sacar a reparto",
  COMPLETED: "Completar pedido",
  REJECTED: "Rechazar pedido",
  CANCELLED: "Cancelar pedido",
};

/** Estados a los que solo se pasa dando un motivo (rechazar y devolver un pedido ya completado). */
export const needsReason = (from: OrderStatus, to: OrderStatus) =>
  to === "REJECTED" || (from === "COMPLETED" && to === "CANCELLED");

export function errorMessage(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  switch (code) {
    case "INVALID_TRANSITION":
      return "Ese cambio ya no es posible: el pedido ha cambiado. Se ha actualizado la pantalla.";
    case "REASON_REQUIRED":
      return "Indica el motivo.";
    case "INVALID_REFUND_AMOUNT":
      return "El importe supera lo que se puede devolver.";
    case "PAYMENT_PROVIDER_ERROR":
      return "Stripe no ha podido hacer la devolución. Inténtalo de nuevo.";
    case "PAYMENTS_NOT_CONFIGURED":
      return "El pago online no está configurado en este entorno.";
    case "KITCHEN_TRANSITION_NOT_ALLOWED":
      return "La cocina no puede hacer este cambio.";
    case "FORBIDDEN":
      return "No tienes permiso para hacer esto.";
    case "NETWORK_ERROR":
      return "No se pudo conectar con el servidor.";
    default:
      return "No se ha podido completar la acción. Inténtalo de nuevo.";
  }
}
