import express, { Router } from "express";

import type { PrismaClient } from "../../db/client.js";
import type { PaymentGateway } from "./gateway.js";
import { processGatewayEvent } from "./payment.service.js";

/**
 * Webhook de la pasarela de pago. Se monta ANTES del lector de JSON: la firma se verifica sobre el
 * cuerpo exacto recibido (bytes sin modificar), por eso aquí se lee en bruto. Sin una firma válida no
 * se hace nada. Responde 200 cuando el evento queda procesado (o ya lo estaba) y 500 si falla, para
 * que la pasarela lo reintente.
 */
export function createWebhookRouter(prisma: PrismaClient, gateway: PaymentGateway): Router {
  const router = Router();

  router.post("/stripe", express.raw({ type: "*/*", limit: "1mb" }), async (req, res) => {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const event = gateway.verifyWebhook(raw, req.header("stripe-signature"));
    const outcome = await processGatewayEvent(prisma, gateway, event);
    res.json({ received: true, outcome });
  });

  return router;
}
