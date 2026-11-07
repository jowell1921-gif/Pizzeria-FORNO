import { Router } from "express";

import type { PrismaClient } from "../../db/client.js";
import { publicCache } from "../../middleware/cache.js";
import { checkDelivery, listDeliveryZones } from "./delivery.service.js";

/** Zonas de reparto y comprobación por código postal. No requiere autenticación. */
export function createDeliveryRouter(prisma: PrismaClient): Router {
  const router = Router();
  router.use(publicCache());

  router.get("/", async (_req, res) => {
    res.json({ data: await listDeliveryZones(prisma) });
  });

  router.get("/check", async (req, res) => {
    res.json({ data: await checkDelivery(prisma, req.query) });
  });

  return router;
}
