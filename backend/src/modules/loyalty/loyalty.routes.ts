import { Router } from "express";

import { requirePermission } from "../../auth/authenticate.js";
import type { PrismaClient } from "../../db/client.js";
import { unauthorized } from "../../errors.js";
import { paginationArgs } from "../../utils/pagination.js";
import { getLoyaltyAccount, listRewards, listTransactions } from "./loyalty.service.js";

/** Consulta de FORNO CLUB del usuario autenticado. Montar detrás de `authenticate`. */
export function createLoyaltyRouter(prisma: PrismaClient): Router {
  const router = Router();

  router.get("/account", requirePermission("loyalty:read:own"), async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.json({ data: await getLoyaltyAccount(prisma, req.auth.userId) });
  });

  router.get("/transactions", requirePermission("loyalty:read:own"), async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.json(await listTransactions(prisma, req.auth.userId, paginationArgs(req.query)));
  });

  router.get("/rewards", requirePermission("loyalty:read:own"), async (_req, res) => {
    res.json({ data: await listRewards(prisma) });
  });

  return router;
}
