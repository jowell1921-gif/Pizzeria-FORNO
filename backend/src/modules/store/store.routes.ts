import { Router } from "express";

import type { PrismaClient } from "../../db/client.js";
import { publicCache } from "../../middleware/cache.js";
import { getStoreSettings } from "./store.service.js";

/** Información pública del local. No requiere autenticación. */
export function createStoreRouter(prisma: PrismaClient): Router {
  const router = Router();
  router.use(publicCache());

  router.get("/settings", async (_req, res) => {
    res.json({ data: await getStoreSettings(prisma) });
  });

  return router;
}
