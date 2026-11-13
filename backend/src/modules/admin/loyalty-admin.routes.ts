import { Router } from "express";

import { requireAccess, requirePermission } from "../../auth/authenticate.js";
import type { PrismaClient } from "../../db/client.js";
import { unauthorized } from "../../errors.js";
import { paginationArgs } from "../../utils/pagination.js";
import { adjustPoints } from "../loyalty/ledger.service.js";
import {
  adjustmentSchema,
  balanceOf,
  createReward,
  deleteReward,
  getLoyaltySettings,
  listAdminRedemptions,
  listAdminRewards,
  listAdminTransactions,
  listCustomers,
  updateLoyaltySettings,
  updateReward,
} from "./loyalty-admin.service.js";

/** Administración de FORNEA CLUB. Permiso `loyalty:manage` (y `customers:read` para ver clientes). */
export function createLoyaltyAdminRouter(prisma: PrismaClient): Router {
  const router = Router();
  const guard = requireAccess("loyalty:read", "loyalty:manage");
  const actor = (req: { auth?: { userId: string } }) => {
    if (!req.auth) throw unauthorized();
    return req.auth.userId;
  };
  const id = (value: unknown) => String(value);

  router.get("/loyalty/settings", guard, async (_req, res) => {
    res.json({ data: await getLoyaltySettings(prisma) });
  });
  router.patch("/loyalty/settings", guard, async (req, res) => {
    res.json({ data: await updateLoyaltySettings(prisma, actor(req), req.body) });
  });

  router.get("/rewards", guard, async (_req, res) => {
    res.json({ data: await listAdminRewards(prisma) });
  });
  router.post("/rewards", guard, async (req, res) => {
    res.status(201).json({ data: await createReward(prisma, actor(req), req.body) });
  });
  router.patch("/rewards/:id", guard, async (req, res) => {
    res.json({ data: await updateReward(prisma, actor(req), id(req.params["id"]), req.body) });
  });
  router.delete("/rewards/:id", guard, async (req, res) => {
    await deleteReward(prisma, actor(req), id(req.params["id"]));
    res.status(204).end();
  });

  router.get("/loyalty/transactions", guard, async (req, res) => {
    res.json(await listAdminTransactions(prisma, req.query, paginationArgs(req.query)));
  });
  router.get("/loyalty/redemptions", guard, async (req, res) => {
    res.json(await listAdminRedemptions(prisma, req.query, paginationArgs(req.query)));
  });

  // Ajuste con motivo: queda en el libro y en la auditoría; el saldo nunca se edita directamente.
  router.post("/loyalty/adjustments", guard, async (req, res) => {
    const { userId, points, reason } = adjustmentSchema.parse(req.body);
    const entry = await adjustPoints(prisma, { userId, actorId: actor(req), points, reason });
    res.status(201).json({
      data: {
        id: entry.id,
        points: entry.points,
        balanceAfter: entry.balanceAfter,
        reason: entry.reason,
        balance: await balanceOf(prisma, userId),
      },
    });
  });

  router.get("/customers", requirePermission("customers:read"), async (req, res) => {
    res.json(await listCustomers(prisma, req.query, paginationArgs(req.query)));
  });

  return router;
}
