import { Router } from "express";

import { requirePermission } from "../../auth/authenticate.js";
import type { PrismaClient } from "../../db/client.js";
import { unauthorized } from "../../errors.js";
import { getCart, replaceCart } from "./cart.service.js";

/** Carrito guardado del usuario autenticado. Montar detrás de `authenticate`. */
export function createCartRouter(prisma: PrismaClient): Router {
  const router = Router();
  const guard = requirePermission("orders:create");

  router.get("/", guard, async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.json({ data: await getCart(prisma, req.auth.userId) });
  });

  router.put("/", guard, async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.json({ data: await replaceCart(prisma, req.auth.userId, req.body) });
  });

  return router;
}
