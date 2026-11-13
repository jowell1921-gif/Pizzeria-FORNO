import { z } from "zod";

import { apiRequestPage } from "@/lib/api";

/**
 * Resumen de pedido tal como lo devuelve la API, con las etiquetas en español de sus estados y
 * modalidades.
 */
export const orderSummarySchema = z.object({
  id: z.string(),
  orderNumber: z.number(),
  status: z.enum([
    "PENDING_PAYMENT",
    "NEW",
    "ACCEPTED",
    "PREPARING",
    "READY",
    "OUT_FOR_DELIVERY",
    "COMPLETED",
    "REJECTED",
    "CANCELLED",
  ]),
  type: z.enum(["PICKUP", "DELIVERY"]),
  total: z.string(),
  itemCount: z.number(),
  createdAt: z.string(),
});

export type OrderSummary = z.infer<typeof orderSummarySchema>;

export const ORDER_STATUS_LABELS: Record<OrderSummary["status"], string> = {
  PENDING_PAYMENT: "Pendiente de pago",
  NEW: "Recibido",
  ACCEPTED: "Aceptado",
  PREPARING: "En preparación",
  READY: "Listo",
  OUT_FOR_DELIVERY: "En reparto",
  COMPLETED: "Completado",
  REJECTED: "Rechazado",
  CANCELLED: "Cancelado",
};

export const ORDER_TYPE_LABELS: Record<OrderSummary["type"], string> = {
  PICKUP: "Recogida",
  DELIVERY: "A domicilio",
};

export const fetchRecentOrders = async (token: string) =>
  apiRequestPage("/orders/me", {
    token,
    query: { page: 1, pageSize: 5 },
    schema: orderSummarySchema,
  });
