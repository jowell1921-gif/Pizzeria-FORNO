import { Router } from "express";

import { requirePermission } from "../../auth/authenticate.js";
import type { PrismaClient } from "../../db/client.js";
import { unauthorized } from "../../errors.js";
import {
  createSpecialDay,
  createZone,
  deleteSpecialDay,
  deleteZone,
  getAdminStoreSettings,
  getOpeningHours,
  listAdminZones,
  listSpecialDays,
  replaceOpeningHours,
  updateStoreSettings,
  updateZone,
} from "./store-admin.service.js";

/** Configuración del local: datos, horarios, festivos y zonas de reparto. Permiso `settings:manage`. */
export function createStoreAdminRouter(prisma: PrismaClient): Router {
  const router = Router();
  const guard = requirePermission("settings:manage");
  const actor = (req: { auth?: { userId: string } }) => {
    if (!req.auth) throw unauthorized();
    return req.auth.userId;
  };
  const id = (value: unknown) => String(value);

  router.get("/store/settings", guard, async (_req, res) => {
    res.json({ data: await getAdminStoreSettings(prisma) });
  });
  router.patch("/store/settings", guard, async (req, res) => {
    res.json({ data: await updateStoreSettings(prisma, actor(req), req.body) });
  });

  router.get("/store/opening-hours", guard, async (_req, res) => {
    res.json({ data: await getOpeningHours(prisma) });
  });
  router.put("/store/opening-hours", guard, async (req, res) => {
    res.json({ data: await replaceOpeningHours(prisma, actor(req), req.body) });
  });

  router.get("/store/special-days", guard, async (_req, res) => {
    res.json({ data: await listSpecialDays(prisma) });
  });
  router.post("/store/special-days", guard, async (req, res) => {
    res.status(201).json({ data: await createSpecialDay(prisma, actor(req), req.body) });
  });
  router.delete("/store/special-days/:id", guard, async (req, res) => {
    await deleteSpecialDay(prisma, actor(req), id(req.params["id"]));
    res.status(204).end();
  });

  router.get("/delivery-zones", guard, async (_req, res) => {
    res.json({ data: await listAdminZones(prisma) });
  });
  router.post("/delivery-zones", guard, async (req, res) => {
    res.status(201).json({ data: await createZone(prisma, actor(req), req.body) });
  });
  router.patch("/delivery-zones/:id", guard, async (req, res) => {
    res.json({ data: await updateZone(prisma, actor(req), id(req.params["id"]), req.body) });
  });
  router.delete("/delivery-zones/:id", guard, async (req, res) => {
    await deleteZone(prisma, actor(req), id(req.params["id"]));
    res.status(204).end();
  });

  return router;
}
