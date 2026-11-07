import { Router } from "express";

import { requirePermission } from "../../auth/authenticate.js";
import type { PrismaClient } from "../../db/client.js";
import { unauthorized } from "../../errors.js";
import { getProfile, updateProfile, updateProfileSchema } from "./me.service.js";

/** Rutas del usuario autenticado. Deben montarse detrás del middleware `authenticate`. */
export function createMeRouter(prisma: PrismaClient): Router {
  const router = Router();

  router.get("/", requirePermission("profile:read:own"), async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.json({ data: await getProfile(prisma, req.auth.userId) });
  });

  router.patch("/", requirePermission("profile:update:own"), async (req, res) => {
    if (!req.auth) throw unauthorized();
    const input = updateProfileSchema.parse(req.body);
    res.json({ data: await updateProfile(prisma, req.auth.userId, input) });
  });

  return router;
}
