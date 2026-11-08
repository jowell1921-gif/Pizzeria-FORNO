import { Router } from "express";

import { requirePermission } from "../../auth/authenticate.js";
import type { PrismaClient } from "../../db/client.js";
import { unauthorized } from "../../errors.js";
import { orderEventStream } from "../../utils/sse.js";
import { changeKitchenStatus, listKitchenOrders } from "./kitchen.service.js";

/** Pantalla de cocina. Montar detrás de `authenticate`. Solo ve y cambia lo imprescindible. */
export function createKitchenRouter(prisma: PrismaClient): Router {
  const router = Router();

  router.get("/orders", requirePermission("kitchen:orders:read"), async (_req, res) => {
    res.json({ data: await listKitchenOrders(prisma) });
  });

  router.get("/stream", requirePermission("kitchen:orders:read"), orderEventStream());

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
        ),
      });
    },
  );

  return router;
}
