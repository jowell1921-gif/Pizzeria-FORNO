import { randomUUID } from "node:crypto";

import request from "supertest";
import Stripe from "stripe";

import { createApp } from "../../src/app.js";
import {
  createStripeGateway,
  type CheckoutSessionInput,
  type PaymentGateway,
} from "../../src/modules/payments/gateway.js";
import type { PrismaClient } from "../db/helpers.js";
import type { createTestApp } from "./app.js";

export const WEBHOOK_SECRET = "whsec_test_secret_for_the_unit_tests";
const signer = new Stripe(`sk_test_${"x".repeat(30)}`);

/**
 * Pasarela de pruebas: la verificación de firma es la REAL de Stripe (sin red); la creación de
 * sesiones y las devoluciones se simulan y quedan anotadas para comprobarlas.
 */
export function createFakeGateway() {
  const real = createStripeGateway(`sk_test_${"x".repeat(30)}`, WEBHOOK_SECRET);
  const state = {
    created: [] as CheckoutSessionInput[],
    refunds: [] as Array<{ paymentIntentId: string; amountCents: number; idempotencyKey: string }>,
    sessions: new Map<string, { url: string; status: "open" | "complete" | "expired" }>(),
    failRefunds: false,
  };
  const gateway: PaymentGateway = {
    ...real,
    async createCheckoutSession(input) {
      state.created.push(input);
      const id = `cs_test_${state.created.length}`;
      const url = `https://checkout.stripe.test/${id}`;
      state.sessions.set(id, { url, status: "open" });
      return { id, url, expiresAt: new Date(Date.now() + 30 * 60_000) };
    },
    async retrieveCheckoutSession(id) {
      const session = state.sessions.get(id);
      return { id, url: session?.url ?? null, status: session?.status ?? "expired" };
    },
    async expireCheckoutSession(id) {
      const session = state.sessions.get(id);
      if (session) session.status = "expired";
    },
    async refund(input) {
      if (state.failRefunds) throw new Error("provider down");
      state.refunds.push(input);
      return { id: `re_test_${state.refunds.length}`, amountCents: input.amountCents };
    },
  };
  return { gateway, state };
}

export function appWithPayments(
  prisma: PrismaClient,
  ctx: Awaited<ReturnType<typeof createTestApp>>,
  gateway: PaymentGateway,
) {
  return createApp(
    { CORS_ORIGINS: [], FRONTEND_URL: "http://localhost:3000" },
    { prisma, verifyToken: ctx.auth.verifyToken, payments: gateway },
  );
}

/** Evento de Stripe firmado como lo haría Stripe. */
export function signedWebhook(
  app: ReturnType<typeof createApp>,
  event: { id?: string; type: string; object: Record<string, unknown> },
  options: { signature?: string | null; secret?: string; payload?: string } = {},
) {
  const payload =
    options.payload ??
    JSON.stringify({
      id: event.id ?? `evt_${randomUUID()}`,
      object: "event",
      type: event.type,
      data: { object: event.object },
    });
  const header =
    options.signature === null
      ? undefined
      : (options.signature ??
        signer.webhooks.generateTestHeaderString({
          payload,
          secret: options.secret ?? WEBHOOK_SECRET,
        }));
  const req = request(app).post("/api/v1/webhooks/stripe").set("Content-Type", "application/json");
  if (header) req.set("Stripe-Signature", header);
  return req.send(payload);
}
