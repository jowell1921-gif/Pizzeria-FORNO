import Stripe from "stripe";

import { HttpError } from "../../errors.js";

/**
 * Pasarela de pago online. La lógica de negocio solo conoce esta interfaz: Stripe es una
 * implementación (otra pasarela, o una falsa en las pruebas, puede ocupar su lugar).
 */
export interface CheckoutSessionInput {
  orderId: string;
  paymentId: string;
  orderNumber: number;
  amountCents: number;
  currency: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  /** Evita crear dos sesiones si la petición se repite. */
  idempotencyKey: string;
}

export interface CheckoutSession {
  id: string;
  url: string;
  expiresAt: Date;
}

export interface RemoteSession {
  id: string;
  url: string | null;
  status: "open" | "complete" | "expired";
}

/** Evento de la pasarela ya verificado (firma comprobada) y reducido a lo que usamos. */
export interface GatewayEvent {
  id: string;
  type: string;
  object: Record<string, unknown>;
}

export interface PaymentGateway {
  readonly provider: string;
  createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSession>;
  retrieveCheckoutSession(sessionId: string): Promise<RemoteSession>;
  /** Cierra una sesión abierta (por ejemplo, al crear otra nueva para el mismo pedido). */
  expireCheckoutSession(sessionId: string): Promise<void>;
  refund(input: {
    paymentIntentId: string;
    amountCents: number;
    idempotencyKey: string;
  }): Promise<{ id: string; amountCents: number }>;
  /** Verifica la firma del webhook sobre el cuerpo SIN modificar. Lanza 400 si no es auténtico. */
  verifyWebhook(rawBody: Buffer, signature: string | undefined): GatewayEvent;
}

/** Los importes de Stripe son enteros en céntimos. */
export const toCents = (amount: { mul: (n: number) => { toFixed: (d: number) => string } }) =>
  Number(amount.mul(100).toFixed(0));

/** Sesión de pago caducada a los 30 minutos (el mínimo que admite Stripe). */
const SESSION_MINUTES = 30;

export function createStripeGateway(secretKey: string, webhookSecret: string): PaymentGateway {
  const stripe = new Stripe(secretKey, { maxNetworkRetries: 2, timeout: 15_000 });

  return {
    provider: "stripe",

    async createCheckoutSession(input) {
      const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MINUTES * 60 + 30;
      const session = await stripe.checkout.sessions.create(
        {
          mode: "payment",
          client_reference_id: input.orderId,
          customer_email: input.customerEmail,
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: input.currency.toLowerCase(),
                unit_amount: input.amountCents,
                product_data: { name: `Pedido FORNO #${input.orderNumber}` },
              },
            },
          ],
          // El pedido y el pago se identifican con metadatos que nosotros controlamos.
          metadata: { orderId: input.orderId, paymentId: input.paymentId },
          payment_intent_data: {
            metadata: { orderId: input.orderId, paymentId: input.paymentId },
          },
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          expires_at: expiresAt,
        },
        { idempotencyKey: input.idempotencyKey },
      );
      if (!session.url) throw new HttpError(502, "PAYMENT_PROVIDER_ERROR", "No payment URL");
      return { id: session.id, url: session.url, expiresAt: new Date(expiresAt * 1000) };
    },

    async retrieveCheckoutSession(sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      return {
        id: session.id,
        url: session.url,
        status: (session.status as RemoteSession["status"] | null) ?? "open",
      };
    },

    async expireCheckoutSession(sessionId) {
      await stripe.checkout.sessions.expire(sessionId);
    },

    async refund(input) {
      const refund = await stripe.refunds.create(
        { payment_intent: input.paymentIntentId, amount: input.amountCents },
        { idempotencyKey: input.idempotencyKey },
      );
      return { id: refund.id, amountCents: refund.amount };
    },

    verifyWebhook(rawBody, signature) {
      if (!signature) throw new HttpError(400, "INVALID_SIGNATURE", "Missing signature");
      try {
        const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
        return {
          id: event.id,
          type: event.type,
          object: event.data.object as unknown as Record<string, unknown>,
        };
      } catch {
        throw new HttpError(400, "INVALID_SIGNATURE", "Invalid webhook signature");
      }
    },
  };
}
