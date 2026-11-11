import { z } from "zod";

import { Prisma, type PrismaClient } from "../../db/client.js";
import { conflict, HttpError, notFound } from "../../errors.js";
import { recordAudit } from "../../utils/audit.js";
import { lockOrder } from "../loyalty/ledger.service.js";
import { changeOrderStatus } from "../orders/status.service.js";
import { toCents, type GatewayEvent, type PaymentGateway } from "./gateway.js";

/**
 * Pago online. Reglas que se cumplen siempre:
 * - Un pedido solo pasa a «pagado» cuando llega un evento AUTÉNTICO de la pasarela (firma verificada).
 *   Volver del navegador con «?pago=ok» no prueba nada.
 * - El importe y la moneda del evento deben coincidir con los del pedido.
 * - Procesar dos veces el mismo evento (o la misma orden de pago) no cambia nada.
 */
const PROVIDER_FAILURE = "PAYMENT_PROVIDER_ERROR";

/** Crea (o reutiliza) la sesión de pago de un pedido del propio usuario y devuelve su URL. */
export async function createPaymentSession(
  prisma: PrismaClient,
  gateway: PaymentGateway,
  input: { userId: string; orderId: string; frontendUrl: string },
) {
  if (!z.uuid().safeParse(input.orderId).success) throw notFound("Order not found");

  return prisma.$transaction(
    async (tx) => {
      // Cerrojo: dos peticiones simultáneas para el mismo pedido no crean dos sesiones.
      await lockOrder(tx, input.orderId);
      const order = await tx.order.findFirst({
        where: { id: input.orderId, userId: input.userId },
        include: { payments: { where: { method: "ONLINE" } } },
      });
      if (!order) throw notFound("Order not found");
      const payment = order.payments[0];
      if (order.status !== "PENDING_PAYMENT" || !payment || payment.status !== "PENDING") {
        throw conflict("ORDER_NOT_PAYABLE", "This order is not waiting for an online payment");
      }

      // Si ya hay una sesión abierta se reutiliza; si terminó, se mira qué ocurrió.
      if (payment.providerSessionId) {
        const remote = await gateway.retrieveCheckoutSession(payment.providerSessionId);
        if (remote.status === "open" && remote.url) return { url: remote.url };
        if (remote.status === "complete") {
          throw conflict("PAYMENT_IN_PROGRESS", "The payment is being confirmed");
        }
      }

      const base = input.frontendUrl;
      const created = await gateway
        .createCheckoutSession({
          orderId: order.id,
          paymentId: payment.id,
          orderNumber: order.orderNumber,
          amountCents: toCents(payment.amount),
          currency: payment.currency,
          customerEmail: order.customerEmail,
          successUrl: `${base}/pedido/${order.id}?pago=ok`,
          cancelUrl: `${base}/pedido/${order.id}?pago=cancelado`,
          // La clave cambia solo si ya hubo una sesión anterior (caducada): así no se reutiliza.
          idempotencyKey: `pay-${payment.id}-${payment.providerSessionId ?? "first"}`,
        })
        .catch((error: unknown) => {
          if (error instanceof HttpError) throw error;
          throw new HttpError(502, PROVIDER_FAILURE, "The payment provider is not available");
        });

      await tx.payment.update({
        where: { id: payment.id },
        data: {
          provider: gateway.provider,
          providerSessionId: created.id,
          failureReason: null,
        },
      });
      return { url: created.url };
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}

// ───────────────────────────── Webhooks ─────────────────────────────

const sessionSchema = z.object({
  id: z.string(),
  payment_status: z.string().optional(),
  payment_intent: z.string().nullable().optional(),
  amount_total: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.string()).nullable().optional(),
});

const intentSchema = z.object({
  id: z.string(),
  metadata: z.record(z.string(), z.string()).nullable().optional(),
  last_payment_error: z.object({ message: z.string().optional() }).nullable().optional(),
});

const chargeSchema = z.object({
  payment_intent: z.string().nullable().optional(),
  amount_refunded: z.number(),
  amount: z.number(),
});

export type WebhookOutcome = "processed" | "duplicate" | "ignored";

/**
 * Procesa un evento de la pasarela ya verificado. Es idempotente: se anota cada evento (índice único
 * por proveedor e identificador) y el procesamiento solo deja el estado correcto, así que un reintento
 * de la pasarela, o un evento repetido, no duplica nada. Si falla, no se anota y se podrá reintentar.
 */
export async function processGatewayEvent(
  prisma: PrismaClient,
  gateway: PaymentGateway,
  event: GatewayEvent,
): Promise<WebhookOutcome> {
  const seen = await prisma.paymentEvent.findUnique({
    where: {
      provider_providerEventId: { provider: gateway.provider, providerEventId: event.id },
    },
  });
  if (seen) return "duplicate";

  let paymentId: string | null = null;
  let outcome: WebhookOutcome = "processed";
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = sessionSchema.parse(event.object);
      paymentId = await settlePayment(prisma, gateway, session);
      break;
    }
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired": {
      const session = sessionSchema.parse(event.object);
      paymentId = await failPayment(
        prisma,
        session.metadata?.["paymentId"],
        event.type === "checkout.session.expired" ? "SESSION_EXPIRED" : "ASYNC_PAYMENT_FAILED",
        true,
      );
      break;
    }
    case "payment_intent.payment_failed": {
      // El cliente puede reintentar dentro de la misma sesión: solo se anota el motivo.
      const intent = intentSchema.parse(event.object);
      paymentId = await failPayment(
        prisma,
        intent.metadata?.["paymentId"],
        intent.last_payment_error?.message?.slice(0, 200) ?? "PAYMENT_FAILED",
        false,
      );
      break;
    }
    case "charge.refunded": {
      paymentId = await applyRefund(prisma, chargeSchema.parse(event.object));
      break;
    }
    default:
      outcome = "ignored";
  }

  try {
    await prisma.paymentEvent.create({
      data: {
        paymentId,
        provider: gateway.provider,
        providerEventId: event.id,
        type: event.type,
        payload: event.object as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    // Otro proceso lo anotó a la vez: el efecto ya es idempotente.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
      throw error;
    }
  }
  return outcome;
}

/**
 * Saca el pedido de «pendiente de pago». Si otro proceso (el mismo evento llegando dos veces a la vez)
 * ya lo movió, no es un error: el resultado deseado ya está.
 */
async function leavePendingPayment(
  prisma: PrismaClient,
  orderId: string,
  to: "NEW" | "CANCELLED",
  reason?: string,
) {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  if (order.status !== "PENDING_PAYMENT") return;
  try {
    await changeOrderStatus(prisma, { orderId, to, actorId: null, ...(reason ? { reason } : {}) });
  } catch (error) {
    if (!(error instanceof HttpError) || error.code !== "INVALID_TRANSITION") throw error;
    const current = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    if (current.status === "PENDING_PAYMENT") throw error;
  }
}

/** Marca el pago como cobrado y el pedido como nuevo. Devuelve el id del pago, si lo hay. */
async function settlePayment(
  prisma: PrismaClient,
  gateway: PaymentGateway,
  session: z.infer<typeof sessionSchema>,
): Promise<string | null> {
  // Sesión sin pago confirmado (métodos asíncronos): se espera al evento de éxito.
  if (session.payment_status !== "paid") return null;
  const paymentId = session.metadata?.["paymentId"];
  const orderId = session.metadata?.["orderId"];
  if (!paymentId || !orderId) return null;

  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, orderId, method: "ONLINE" },
  });
  if (!payment) return null;

  // El importe y la moneda cobrados deben ser exactamente los del pedido.
  const matches =
    session.amount_total === toCents(payment.amount) &&
    session.currency?.toUpperCase() === payment.currency.toUpperCase();
  if (!matches) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED", failureReason: "AMOUNT_MISMATCH" },
    });
    return payment.id;
  }

  const lateRefund = await prisma.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    const current = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
    if (current.status !== "PAID" && current.status !== "REFUNDED") {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "PAID",
          paidAt: new Date(),
          provider: gateway.provider,
          providerSessionId: current.providerSessionId ?? session.id,
          providerPaymentId: session.payment_intent ?? null,
          failureReason: null,
        },
      });
    }
    // El pedido ya se canceló antes de llegar el pago: hay que devolver el dinero.
    return order.status === "CANCELLED" || order.status === "REJECTED";
  });

  if (lateRefund) {
    await refundPayment(prisma, gateway, {
      paymentId: payment.id,
      actorId: null,
      reason: "Late payment",
    });
  } else {
    await leavePendingPayment(prisma, orderId, "NEW");
  }
  return payment.id;
}

/**
 * Pago fallido. Con `cancelOrder` (sesión caducada o rechazada) también se cancela el pedido, lo que
 * libera cupón, recompensa y puntos; si no, solo se anota el motivo para que el cliente reintente.
 */
async function failPayment(
  prisma: PrismaClient,
  paymentId: string | undefined,
  reason: string,
  cancelOrder: boolean,
): Promise<string | null> {
  if (!paymentId) return null;
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.method !== "ONLINE") return null;
  // Un pago ya cobrado nunca se marca como fallido por un evento posterior.
  if (payment.status !== "PENDING") return payment.id;

  if (!cancelOrder) {
    await prisma.payment.update({ where: { id: payment.id }, data: { failureReason: reason } });
    return payment.id;
  }
  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: "FAILED", failureReason: reason },
  });
  await leavePendingPayment(prisma, payment.orderId, "CANCELLED", "Pago no completado");
  return payment.id;
}

/** Refleja en el pago lo devuelto según la pasarela (valor absoluto: repetirlo no cambia nada). */
async function applyRefund(
  prisma: PrismaClient,
  charge: z.infer<typeof chargeSchema>,
): Promise<string | null> {
  if (!charge.payment_intent) return null;
  const payment = await prisma.payment.findFirst({
    where: { providerPaymentId: charge.payment_intent },
  });
  if (!payment) return null;
  const refunded = Prisma.Decimal.min(
    new Prisma.Decimal(charge.amount_refunded).div(100),
    payment.amount,
  );
  const status = refunded.greaterThanOrEqualTo(payment.amount) ? "REFUNDED" : "PARTIALLY_REFUNDED";
  if (refunded.greaterThan(0)) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { refundedAmount: refunded, status },
    });
  }
  return payment.id;
}

// ───────────────────────────── Reembolsos ─────────────────────────────

export const refundSchema = z
  .object({
    /** Importe a devolver, en euros («5.00»). Sin él, se devuelve todo lo pendiente. */
    amount: z
      .string()
      .regex(/^\d{1,6}(\.\d{1,2})?$/, "Invalid amount")
      .optional(),
    reason: z.string().trim().min(3).max(300),
  })
  .strict();

/**
 * Devuelve dinero de un pago online ya cobrado. Es idempotente: la clave enviada a la pasarela depende
 * del estado del pago (cuánto se ha devuelto ya), de modo que repetir la misma petición no devuelve dos veces.
 */
export async function refundPayment(
  prisma: PrismaClient,
  gateway: PaymentGateway,
  input: { paymentId: string; actorId: string | null; reason: string; amount?: string },
) {
  const payment = await prisma.payment.findUnique({ where: { id: input.paymentId } });
  if (!payment || payment.method !== "ONLINE") throw notFound("Payment not found");
  if (
    (payment.status !== "PAID" && payment.status !== "PARTIALLY_REFUNDED") ||
    !payment.providerPaymentId
  ) {
    throw conflict("NOT_REFUNDABLE", "Only a collected online payment can be refunded");
  }
  const refundable = payment.amount.sub(payment.refundedAmount);
  const amount = input.amount ? new Prisma.Decimal(input.amount) : refundable;
  if (amount.lessThanOrEqualTo(0) || amount.greaterThan(refundable)) {
    throw new HttpError(422, "INVALID_REFUND_AMOUNT", "The amount exceeds what can be refunded", {
      refundable: refundable.toFixed(2),
    });
  }

  const cents = toCents(amount);
  const result = await gateway
    .refund({
      paymentIntentId: payment.providerPaymentId,
      amountCents: cents,
      idempotencyKey: `refund-${payment.id}-${toCents(payment.refundedAmount)}-${cents}`,
    })
    .catch((error: unknown) => {
      if (error instanceof HttpError) throw error;
      throw new HttpError(502, PROVIDER_FAILURE, "The payment provider could not refund");
    });

  return prisma.$transaction(async (tx) => {
    await lockOrder(tx, payment.orderId);
    const current = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
    // Si el webhook ya reflejó esta devolución, no se suma otra vez.
    const total = Prisma.Decimal.max(current.refundedAmount, payment.refundedAmount.add(amount));
    const status = total.greaterThanOrEqualTo(payment.amount) ? "REFUNDED" : "PARTIALLY_REFUNDED";
    const updated = await tx.payment.update({
      where: { id: payment.id },
      data: { refundedAmount: total, status },
    });
    if (input.actorId) {
      await recordAudit(tx, {
        actorId: input.actorId,
        action: "payment.refund",
        entityType: "Payment",
        entityId: payment.id,
        before: { refundedAmount: payment.refundedAmount.toFixed(2) },
        after: { refundedAmount: total.toFixed(2), providerRefundId: result.id },
        reason: input.reason,
      });
    }
    return updated;
  });
}
