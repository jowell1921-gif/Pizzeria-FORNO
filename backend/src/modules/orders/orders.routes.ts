import { Router } from "express";

import { requirePermission } from "../../auth/authenticate.js";
import type { PrismaClient } from "../../db/client.js";
import { unauthorized } from "../../errors.js";
import { paginationArgs } from "../../utils/pagination.js";
import { requireIdempotencyKey, runIdempotent } from "../../utils/idempotency.js";
import { createOrder } from "./create-order.service.js";
import { getMyOrder, listMyOrders } from "./orders.service.js";

/**
 * Creación y consulta de los pedidos del propio usuario. Montar detrás de `authenticate`.
 * (La gestión por el personal llega en la fase 8.)
 */
export function createOrdersRouter(prisma: PrismaClient): Router {
  const router = Router();

  // La clave de idempotencia evita pedidos duplicados por doble clic o reintentos de red.
  router.post("/", requirePermission("orders:create"), async (req, res) => {
    if (!req.auth) throw unauthorized();
    const userId = req.auth.userId;
    const key = requireIdempotencyKey(req.header("Idempotency-Key"));
    const result = await runIdempotent(
      prisma,
      { userId, endpoint: "POST /orders", key, body: req.body },
      async () => ({ status: 201, body: { data: await createOrder(prisma, userId, req.body) } }),
    );
    if (result.replayed) res.setHeader("Idempotent-Replayed", "true");
    res.status(result.status).json(result.body);
  });

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
