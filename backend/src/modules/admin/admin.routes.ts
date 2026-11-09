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
import { listAudit } from "./audit-admin.service.js";
import type { ImageStorage } from "./storage.js";
import { createUploadsRouter } from "./uploads.routes.js";
import { createCatalogAdminRouter } from "./catalog-admin.routes.js";
import { getAdminOrder, getDashboard, listAdminOrders } from "./orders-admin.service.js";

/**
 * Rutas del personal. Montar detrás de `authenticate`. Cada ruta exige su permiso explícito; el rol
 * por sí solo no basta. Los pagos solo se muestran a quien tiene `payments:read`.
 */
export function createAdminRouter(prisma: PrismaClient, storage?: ImageStorage): Router {
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
