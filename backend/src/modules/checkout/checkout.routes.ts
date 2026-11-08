import { Router } from "express";

import type { PrismaClient } from "../../db/client.js";
import { quoteCart } from "./quote.service.js";

/** Presupuesto del carrito. Público: calcular importes no revela nada sensible. */
export function createCheckoutRouter(prisma: PrismaClient): Router {
  const router = Router();

  router.post("/quote", async (req, res) => {
    res.json({ data: await quoteCart(prisma, req.body) });
  });

  return router;
}
