import { Router } from "express";

import type { PrismaClient } from "../../db/client.js";
import { quoteCart } from "./quote.service.js";

/**
 * Presupuesto del carrito. Público: calcular importes no revela nada sensible. Con sesión (montar
 * detrás de `createOptionalAuthenticate`) también valida cupones y recompensas.
 */
export function createCheckoutRouter(prisma: PrismaClient): Router {
  const router = Router();

  router.post("/quote", async (req, res) => {
    res.json({ data: await quoteCart(prisma, req.body, req.auth?.userId ?? null) });
  });

  return router;
}
