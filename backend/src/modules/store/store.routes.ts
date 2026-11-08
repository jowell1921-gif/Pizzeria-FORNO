import { Router } from "express";

import type { PrismaClient } from "../../db/client.js";
import { publicCache } from "../../middleware/cache.js";
import { getStoreSlots, getStoreSettings } from "./store.service.js";

/** Información pública del local. No requiere autenticación. */
export function createStoreRouter(prisma: PrismaClient): Router {
  const router = Router();
  router.use(publicCache());

  router.get("/settings", async (_req, res) => {
    res.json({ data: await getStoreSettings(prisma) });
  });

  router.get("/slots", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ data: await getStoreSlots(prisma, req.query) });
  });

  return router;
}
