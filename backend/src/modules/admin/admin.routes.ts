import { Router } from "express";

import { requirePermission } from "../../auth/authenticate.js";
import type { PrismaClient } from "../../db/client.js";
import { unauthorized } from "../../errors.js";
import { orderEventStream } from "../../utils/sse.js";
import { paginationArgs } from "../../utils/pagination.js";
import { changeOrderStatus, changeStatusSchema } from "../orders/status.service.js";
import { createLoyaltyAdminRouter } from "./loyalty-admin.routes.js";
import { createPromotionsAdminRouter } from "./promotions-admin.routes.js";
import { createStoreAdminRouter } from "./store-admin.routes.js";
import { z } from "zod";

import { conflict, notFound } from "../../errors.js";
import { documentTypeSchema, renderDocumentPdf } from "../documents/documents.service.js";
import { listNotifications } from "../notifications/notifications-admin.service.js";
import type { PaymentGateway } from "../payments/gateway.js";
import { refundPayment, refundSchema } from "../payments/payment.service.js";
import { listAudit } from "./audit-admin.service.js";
import type { ImageStorage } from "./storage.js";
import { createUploadsRouter } from "./uploads.routes.js";
import { createCatalogAdminRouter } from "./catalog-admin.routes.js";
import { getAdminOrder, getDashboard, listAdminOrders } from "./orders-admin.service.js";

/**
 * Rutas del personal. Montar detrás de `authenticate`. Cada ruta exige su permiso explícito; el rol
 * por sí solo no basta. Los pagos solo se muestran a quien tiene `payments:read`.
 */
export function createAdminRouter(
  prisma: PrismaClient,
  storage?: ImageStorage,
  gateway?: PaymentGateway,
): Router {
  const router = Router();

  router.get("/dashboard", requirePermission("dashboard:read"), async (_req, res) => {
    res.json({ data: await getDashboard(prisma) });
  });

  router.get("/orders", requirePermission("orders:read:all"), async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.json(
      await listAdminOrders(prisma, req.query, paginationArgs(req.query), {
        includePayments: req.auth.permissions.includes("payments:read"),
      }),
    );
  });

  // Antes de «/orders/:id» para que «stream» no se interprete como un identificador.
  router.get("/stream", requirePermission("orders:read:all"), orderEventStream());

  router.get("/orders/:id", requirePermission("orders:read:all"), async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.json({
      data: await getAdminOrder(prisma, String(req.params["id"]), {
        includePayments: req.auth.permissions.includes("payments:read"),
      }),
    });
  });

  router.patch(
    "/orders/:id/status",
    requirePermission("orders:update-status"),
    async (req, res) => {
      if (!req.auth) throw unauthorized();
      const { status, reason } = changeStatusSchema.parse(req.body);
      await changeOrderStatus(prisma, {
        orderId: String(req.params["id"]),
        to: status,
        actorId: req.auth.userId,
        ...(reason ? { reason } : {}),
      });
      res.json({
        data: await getAdminOrder(prisma, String(req.params["id"]), {
          includePayments: req.auth.permissions.includes("payments:read"),
        }),
      });
    },
  );

  // Reembolso (total o parcial) de un pago online ya cobrado.
  router.post("/orders/:id/refund", requirePermission("payments:refund"), async (req, res) => {
    if (!req.auth) throw unauthorized();
    if (!gateway) throw conflict("PAYMENTS_NOT_CONFIGURED", "Online payments are not available");
    const orderId = String(req.params["id"]);
    if (!z.uuid().safeParse(orderId).success) throw notFound("Order not found");
    const body = refundSchema.parse(req.body);
    const payment = await prisma.payment.findFirst({
      where: { orderId, method: "ONLINE", status: { in: ["PAID", "PARTIALLY_REFUNDED"] } },
    });
    if (!payment) throw notFound("There is no collected online payment to refund");
    await refundPayment(prisma, gateway, {
      paymentId: payment.id,
      actorId: req.auth.userId,
      reason: body.reason,
      ...(body.amount ? { amount: body.amount } : {}),
    });
    res.json({ data: await getAdminOrder(prisma, orderId, { includePayments: true }) });
  });

  // Ticket o factura del pedido, en PDF.
  router.get(
    "/orders/:id/documents/:type",
    requirePermission("orders:read:all"),
    async (req, res) => {
      const { pdf, fileName } = await renderDocumentPdf(prisma, {
        orderId: String(req.params["id"]),
        type: documentTypeSchema.parse(req.params["type"]),
      });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      res.setHeader("Cache-Control", "private, no-store");
      res.send(pdf);
    },
  );

  // Correos de pedido enviados o registrados.
  router.get("/notifications", requirePermission("settings:manage"), async (req, res) => {
    res.json(await listNotifications(prisma, req.query, paginationArgs(req.query)));
  });

  router.use(createCatalogAdminRouter(prisma));
  router.use(createStoreAdminRouter(prisma));
  router.use(createPromotionsAdminRouter(prisma));
  router.use(createLoyaltyAdminRouter(prisma));
  router.use(createUploadsRouter(prisma, storage));

  router.get("/audit", requirePermission("audit:read"), async (req, res) => {
    res.json(await listAudit(prisma, req.query, paginationArgs(req.query)));
  });

  return router;
}
