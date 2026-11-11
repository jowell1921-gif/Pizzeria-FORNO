import { z } from "zod";

import { ApiError, apiRequest } from "@/lib/api";

import { discountErrorMessage } from "./discount-errors";

import { orderSummarySchema } from "@/features/account/orders";

const money = z.string();
const status = orderSummarySchema.shape.status;

export const orderSchema = z.object({
  id: z.string(),
  orderNumber: z.number(),
  status,
  type: z.enum(["PICKUP", "DELIVERY"]),
  scheduledFor: z.string().nullable(),
  estimatedReadyAt: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  delivery: z
    .object({
      name: z.string().nullable(),
      line1: z.string().nullable(),
      line2: z.string().nullable(),
      postalCode: z.string().nullable(),
      city: z.string().nullable(),
      notes: z.string().nullable(),
    })
    .nullable(),
  items: z.array(
    z.object({
      id: z.string(),
      productName: z.string(),
      quantity: z.number(),
      unitPrice: money,
      lineTotal: money,
      options: z.array(z.object({ group: z.string(), name: z.string(), priceDelta: money })),
    }),
  ),
  discounts: z.array(z.object({ description: z.string(), amount: money })),
  totals: z.object({
    subtotal: money,
    discount: money,
    deliveryFee: money,
    tax: money,
    total: money,
  }),
  payments: z.array(
    z.object({
      method: z.enum(["ONLINE", "CASH_PICKUP", "CASH_DELIVERY"]),
      status: z.string(),
      amount: money,
    }),
  ),
  history: z.array(z.object({ status, at: z.string() })),
});

export type Order = z.infer<typeof orderSchema>;
export type PaymentMethod = Order["payments"][number]["method"];

export interface CreateOrderBody {
  items: Array<{ productId: string; quantity: number; optionIds: string[]; notes?: string }>;
  type: "PICKUP" | "DELIVERY";
  addressId?: string;
  scheduledFor?: string;
  paymentMethod: PaymentMethod;
  notes?: string;
}

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  ONLINE: "Pago online con tarjeta",
  CASH_PICKUP: "Efectivo al recoger",
  CASH_DELIVERY: "Efectivo al recibir",
};

/** Estado del pago de un pedido, en palabras del cliente. */
export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  CASH_PENDING: "Pendiente: se paga en efectivo",
  CASH_COLLECTED: "Cobrado en efectivo",
  PAID: "Pagado",
  PENDING: "Pendiente de pago",
  FAILED: "Pago fallido",
  CANCELLED: "Pago cancelado",
  REFUNDED: "Reembolsado",
  PARTIALLY_REFUNDED: "Reembolsado en parte",
};

/** Cada intento de confirmar lleva su clave: reintentar el mismo pedido no lo duplica. */
export const createOrder = (token: string, body: CreateOrderBody, idempotencyKey: string) =>
  apiRequest("/orders", {
    token,
    method: "POST",
    body,
    headers: { "Idempotency-Key": idempotencyKey },
    schema: orderSchema,
  });

/** Crea la sesión de pago online (Stripe) del pedido y devuelve la URL a la que ir. */
export const startPayment = (token: string, id: string) =>
  apiRequest(`/orders/${encodeURIComponent(id)}/payment-session`, {
    token,
    method: "POST",
    schema: z.object({ url: z.url() }),
  });

export const documentInfoSchema = z.object({
  type: z.enum(["INVOICE", "RECEIPT"]),
  number: z.string(),
  issuedAt: z.string(),
  total: z.string(),
});

export const orderDocumentsSchema = z.object({
  settled: z.boolean(),
  documents: z.array(documentInfoSchema),
});

export const fetchOrderDocuments = (token: string, id: string) =>
  apiRequest(`/orders/${encodeURIComponent(id)}/documents`, {
    token,
    schema: orderDocumentsSchema,
  });

export interface InvoiceData {
  name: string;
  taxId: string;
  address: string;
}

export const requestInvoice = (token: string, id: string, body: InvoiceData) =>
  apiRequest(`/orders/${encodeURIComponent(id)}/invoice`, {
    token,
    method: "POST",
    body: { ...body },
    schema: documentInfoSchema,
  });

/** El cliente cancela su pedido mientras el local no lo haya aceptado. */
export const cancelOrder = (token: string, id: string) =>
  apiRequest(`/orders/${encodeURIComponent(id)}/cancel`, {
    token,
    method: "POST",
    schema: orderSchema,
  });

export const fetchOrder = (token: string, id: string) =>
  apiRequest(`/orders/${encodeURIComponent(id)}`, { token, schema: orderSchema });

/** Mensaje en español para un error al crear el pedido, a partir del código de la API. */
export function orderErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return "No hemos podido enviar tu pedido. Inténtalo de nuevo.";
  switch (error.code) {
    case "NETWORK_ERROR":
      return "No se pudo conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.";
    case "PROFILE_INCOMPLETE":
      return "Completa tu nombre de usuario y tu teléfono en «Mi cuenta» antes de pedir.";
    case "ORDERS_PAUSED":
      return error.message || "Ahora mismo no estamos aceptando pedidos.";
    case "STORE_CLOSED":
      return "El local está cerrado ahora. Elige una hora para tu pedido.";
    case "ORDER_TYPE_UNAVAILABLE":
      return "Esta modalidad de pedido no está disponible ahora mismo.";
    case "PAYMENT_METHOD_UNAVAILABLE":
    case "PAYMENT_METHOD_MISMATCH":
      return "Este método de pago no está disponible. Elige otro.";
    case "OUTSIDE_DELIVERY_ZONE":
      return "No repartimos en el código postal de esta dirección.";
    case "BELOW_MINIMUM_ORDER":
      return "Tu pedido no alcanza el importe mínimo para tu zona de reparto.";
    case "INVALID_SCHEDULE":
      return "La hora elegida ya no está disponible. Elige otra.";
    case "ADDRESS_NOT_FOUND":
      return "La dirección elegida ya no existe. Elige otra.";
    case "PRODUCT_NOT_FOUND":
    case "PRODUCT_UNAVAILABLE":
    case "OPTION_UNAVAILABLE":
    case "INVALID_OPTIONS":
      return "Algún producto de tu pedido ya no está disponible o ha cambiado. Revisa tu pedido.";
    case "REQUEST_IN_PROGRESS":
      return "Tu pedido se está procesando. Espera un momento y revisa «Mis pedidos».";
    case "ORDER_NOT_PAYABLE":
      return "Este pedido ya no está pendiente de pago.";
    case "PAYMENT_IN_PROGRESS":
      return "Estamos confirmando tu pago. Espera un momento.";
    case "PAYMENTS_NOT_CONFIGURED":
      return "El pago online no está disponible ahora mismo.";
    case "PAYMENT_PROVIDER_ERROR":
      return "No hemos podido conectar con la pasarela de pago. Inténtalo de nuevo en unos minutos.";
    case "DOCUMENT_NOT_AVAILABLE":
      return "Todavía no puedes descargar este documento: el pedido aún no está cobrado.";
    case "CANNOT_CANCEL":
      return "El local ya ha empezado a preparar tu pedido: llámanos para cancelarlo.";
    case "RATE_LIMITED":
      return "Demasiados intentos. Espera un minuto e inténtalo de nuevo.";
    default:
      return /^(COUPON_|REDEMPTION_|REWARD_)/.test(error.code)
        ? discountErrorMessage(error)
        : "No hemos podido enviar tu pedido. Inténtalo de nuevo.";
  }
}
