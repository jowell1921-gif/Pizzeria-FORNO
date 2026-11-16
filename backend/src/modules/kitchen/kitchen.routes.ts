import { Router } from "express";

import { requirePermission } from "../../auth/authenticate.js";
import type { PrismaClient } from "../../db/client.js";
import { unauthorized } from "../../errors.js";
import { orderEventStream } from "../../utils/sse.js";
import { changeKitchenStatus, listKitchenOrders } from "./kitchen.service.js";

/** Pantalla de cocina. Montar detrás de `authenticate`. Solo ve y cambia lo imprescindible. */
export function createKitchenRouter(prisma: PrismaClient): Router {
  const router =
    Router(); /** Un visitante de la demostración solo ve los pedidos que ha hecho él mismo. */
  const scope = (req: { auth?: { ownDataOnly: boolean; userId: string } }) =>
    req.auth?.ownDataOnly ? req.auth.userId : undefined;

  router.get("/orders", requirePermission("kitchen:orders:read"), async (req, res) => {
    res.json({ data: await listKitchenOrders(prisma, new Date(), { onlyUserId: scope(req) }) });
  });

  router.get("/stream", requirePermission("kitchen:orders:read"), orderEventStream(scope));

  router.patch(
    "/orders/:id/status",
    requirePermission("kitchen:orders:update-status"),
    async (req, res) => {
      if (!req.auth) throw unauthorized();
      res.json({
        data: await changeKitchenStatus(
          prisma,
          req.auth.userId,
          String(req.params["id"]),
          req.body,
          { onlyUserId: scope(req) },
        ),
      });
    },
  );

  return router;
}
