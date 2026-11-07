import { Router } from "express";

import { requirePermission } from "../../auth/authenticate.js";
import type { PrismaClient } from "../../db/client.js";
import { unauthorized } from "../../errors.js";
import { paginationArgs } from "../../utils/pagination.js";
import { getMyOrder, listMyOrders } from "./orders.service.js";

/**
 * Consulta de los pedidos del propio usuario. Montar detrás de `authenticate`.
 * (La creación de pedidos y la gestión por el personal llegan en las fases 6 y 8.)
 */
export function createOrdersRouter(prisma: PrismaClient): Router {
  const router = Router();

  // Importante: «/me» va antes que «/:id».
  router.get("/me", requirePermission("orders:read:own"), async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.json(await listMyOrders(prisma, req.auth.userId, paginationArgs(req.query)));
  });

  router.get("/:id", requirePermission("orders:read:own"), async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.json({ data: await getMyOrder(prisma, req.auth.userId, String(req.params["id"])) });
  });

  return router;
}
