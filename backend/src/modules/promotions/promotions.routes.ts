import { Router } from "express";

import type { PrismaClient } from "../../db/client.js";
import { publicCache } from "../../middleware/cache.js";
import { listPromotions } from "./promotions.service.js";

/** Promociones vigentes. No requiere autenticación. */
export function createPromotionsRouter(prisma: PrismaClient): Router {
  const router = Router();
  router.use(publicCache());

  router.get("/", async (_req, res) => {
    res.json({ data: await listPromotions(prisma) });
  });

  return router;
}
