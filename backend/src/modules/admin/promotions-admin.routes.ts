import { Router } from "express";

import { requireAccess } from "../../auth/authenticate.js";
import type { PrismaClient } from "../../db/client.js";
import { unauthorized } from "../../errors.js";
import {
  createCoupon,
  createPromotion,
  deleteCoupon,
  deletePromotion,
  getAdminPromotion,
  listAdminPromotions,
  updateCoupon,
  updatePromotion,
} from "./promotions-admin.service.js";

/** Promociones y cupones. Permiso `promotions:manage`. */
export function createPromotionsAdminRouter(prisma: PrismaClient): Router {
  const router = Router();
  const guard = requireAccess("promotions:read", "promotions:manage");
  const actor = (req: { auth?: { userId: string } }) => {
    if (!req.auth) throw unauthorized();
    return req.auth.userId;
  };
  const id = (value: unknown) => String(value);

  router.get("/promotions", guard, async (_req, res) => {
    res.json({ data: await listAdminPromotions(prisma) });
  });
  router.post("/promotions", guard, async (req, res) => {
    res.status(201).json({ data: await createPromotion(prisma, actor(req), req.body) });
  });
  router.get("/promotions/:id", guard, async (req, res) => {
    res.json({ data: await getAdminPromotion(prisma, id(req.params["id"])) });
  });
  router.patch("/promotions/:id", guard, async (req, res) => {
    res.json({ data: await updatePromotion(prisma, actor(req), id(req.params["id"]), req.body) });
  });
  router.delete("/promotions/:id", guard, async (req, res) => {
    await deletePromotion(prisma, actor(req), id(req.params["id"]));
    res.status(204).end();
  });

  router.post("/promotions/:id/coupons", guard, async (req, res) => {
    res
      .status(201)
      .json({ data: await createCoupon(prisma, actor(req), id(req.params["id"]), req.body) });
  });
  router.patch("/coupons/:id", guard, async (req, res) => {
    res.json({ data: await updateCoupon(prisma, actor(req), id(req.params["id"]), req.body) });
  });
  router.delete("/coupons/:id", guard, async (req, res) => {
    await deleteCoupon(prisma, actor(req), id(req.params["id"]));
    res.status(204).end();
  });

  return router;
}
