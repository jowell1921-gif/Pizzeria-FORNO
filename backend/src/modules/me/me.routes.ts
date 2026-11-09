import { Router } from "express";

import { requirePermission } from "../../auth/authenticate.js";
import type { PrismaClient } from "../../db/client.js";
import { forbidden, unauthorized } from "../../errors.js";
import { getProfile, setOwnAdminRole, updateProfile, updateProfileSchema } from "./me.service.js";

const selfAdminDisabled = () =>
  forbidden(
    "SELF_ADMIN_DISABLED",
    "Becoming an administrator is not available in this environment",
  );

/**
 * Rutas del usuario autenticado. Deben montarse detrás del middleware `authenticate`.
 * `selfAdminAvailable` activa la función de demostración «hazte administrador».
 */
export function createMeRouter(prisma: PrismaClient, selfAdminAvailable = false): Router {
  const router = Router();

  router.get("/", requirePermission("profile:read:own"), async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.json({ data: await getProfile(prisma, req.auth.userId, selfAdminAvailable) });
  });

  router.patch("/", requirePermission("profile:update:own"), async (req, res) => {
    if (!req.auth) throw unauthorized();
    const input = updateProfileSchema.parse(req.body);
    res.json({ data: await updateProfile(prisma, req.auth.userId, input, selfAdminAvailable) });
  });

  router.put("/admin-role", requirePermission("profile:update:own"), async (req, res) => {
    if (!req.auth) throw unauthorized();
    if (!selfAdminAvailable) throw selfAdminDisabled();
    res.json({ data: await setOwnAdminRole(prisma, req.auth.userId, true) });
  });

  router.delete("/admin-role", requirePermission("profile:update:own"), async (req, res) => {
    if (!req.auth) throw unauthorized();
    if (!selfAdminAvailable) throw selfAdminDisabled();
    res.json({ data: await setOwnAdminRole(prisma, req.auth.userId, false) });
  });

  return router;
}
