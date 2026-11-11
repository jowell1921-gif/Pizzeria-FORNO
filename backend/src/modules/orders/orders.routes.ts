import { Router } from "express";

import { requirePermission } from "../../auth/authenticate.js";
import type { PrismaClient } from "../../db/client.js";
import { unauthorized } from "../../errors.js";
import { paginationArgs } from "../../utils/pagination.js";
import { requireIdempotencyKey, runIdempotent } from "../../utils/idempotency.js";

import { conflict } from "../../errors.js";
import { documentTypeSchema, renderDocumentPdf } from "../documents/documents.service.js";
import {
  documentView,
  invoiceRequestSchema,
  issueDocument,
  listDocuments,
} from "../documents/invoice.service.js";
import type { PaymentGateway } from "../payments/gateway.js";
import { createPaymentSession } from "../payments/payment.service.js";
import { createOrder } from "./create-order.service.js";
import { getMyOrder, listMyOrders } from "./orders.service.js";
import { cancelMyOrder } from "./status.service.js";

/**
 * Creación y consulta de los pedidos del propio usuario. Montar detrás de `authenticate`.
 * El pago online usa la pasarela recibida; sin ella, ese método no está disponible.
 */
export interface OrdersRouterOptions {
  gateway?: PaymentGateway | undefined;
  /** URL pública de la web (a donde vuelve el cliente tras pagar). */
  frontendUrl: string;
}

export function createOrdersRouter(prisma: PrismaClient, options: OrdersRouterOptions): Router {
  const router = Router();

  // La clave de idempotencia evita pedidos duplicados por doble clic o reintentos de red.
  router.post("/", requirePermission("orders:create"), async (req, res) => {
    if (!req.auth) throw unauthorized();
    const userId = req.auth.userId;
    const key = requireIdempotencyKey(req.header("Idempotency-Key"));
    const result = await runIdempotent(
      prisma,
      { userId, endpoint: "POST /orders", key, body: req.body },
      async () => ({
        status: 201,
        body: {
          data: await createOrder(prisma, userId, req.body, new Date(), {
            onlineProvider: options.gateway?.provider,
          }),
        },
      }),
    );
    if (result.replayed) res.setHeader("Idempotent-Replayed", "true");
    res.status(result.status).json(result.body);
  });

  // Importante: «/me» va antes que «/:id».
  router.get("/me", requirePermission("orders:read:own"), async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.json(await listMyOrders(prisma, req.auth.userId, paginationArgs(req.query)));
  });

  // Sesión de pago online (Stripe Checkout) de un pedido pendiente de pago. Devuelve la URL a la que ir.
  router.post("/:id/payment-session", requirePermission("orders:create"), async (req, res) => {
    if (!req.auth) throw unauthorized();
    if (!options.gateway) {
      throw conflict("PAYMENTS_NOT_CONFIGURED", "Online payments are not available");
    }
    res.json({
      data: await createPaymentSession(prisma, options.gateway, {
        userId: req.auth.userId,
        orderId: String(req.params["id"]),
        frontendUrl: options.frontendUrl,
      }),
    });
  });

  // Tickets y facturas del pedido.
  router.get("/:id/documents", requirePermission("orders:read:own"), async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.json({
      data: await listDocuments(prisma, String(req.params["id"]), req.auth.userId),
    });
  });

  router.get("/:id/documents/:type", requirePermission("orders:read:own"), async (req, res) => {
    if (!req.auth) throw unauthorized();
    const type = documentTypeSchema.parse(req.params["type"]);
    const { pdf, fileName } = await renderDocumentPdf(prisma, {
      orderId: String(req.params["id"]),
      type,
      userId: req.auth.userId,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(pdf);
  });

  router.post("/:id/invoice", requirePermission("orders:read:own"), async (req, res) => {
    if (!req.auth) throw unauthorized();
    const customer = invoiceRequestSchema.parse(req.body);
    const invoice = await issueDocument(prisma, {
      orderId: String(req.params["id"]),
      userId: req.auth.userId,
      type: "INVOICE",
      customer,
    });
    res.status(201).json({ data: documentView(invoice) });
  });

  // El cliente puede cancelar su pedido mientras el local no lo haya aceptado.
  router.post("/:id/cancel", requirePermission("orders:read:own"), async (req, res) => {
    if (!req.auth) throw unauthorized();
    await cancelMyOrder(prisma, req.auth.userId, String(req.params["id"]));
    res.json({ data: await getMyOrder(prisma, req.auth.userId, String(req.params["id"])) });
  });

  router.get("/:id", requirePermission("orders:read:own"), async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.json({ data: await getMyOrder(prisma, req.auth.userId, String(req.params["id"])) });
  });

  return router;
}
