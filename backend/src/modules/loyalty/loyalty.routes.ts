import { Router } from "express";

import { requirePermission } from "../../auth/authenticate.js";
import type { PrismaClient } from "../../db/client.js";
import { unauthorized } from "../../errors.js";
import { paginationArgs } from "../../utils/pagination.js";
import { requireIdempotencyKey, runIdempotent } from "../../utils/idempotency.js";
import { publicCache } from "../../middleware/cache.js";
import { redeemReward } from "./ledger.service.js";
import {
  getLoyaltyAccount,
  getLoyaltyProgram,
  listRedemptions,
  listRewards,
  listTransactions,
  redemptionView,
} from "./loyalty.service.js";
import { z } from "zod";

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

  router.get("/redemptions", requirePermission("loyalty:read:own"), async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.json(await listRedemptions(prisma, req.auth.userId, req.query, paginationArgs(req.query)));
  });

  // Canjear una recompensa: con Idempotency-Key, un reintento no descuenta los puntos dos veces.
  router.post("/redemptions", requirePermission("loyalty:redeem"), async (req, res) => {
    if (!req.auth) throw unauthorized();
    const userId = req.auth.userId;
    const key = requireIdempotencyKey(req.header("Idempotency-Key"));
    const { rewardId } = redeemSchema.parse(req.body);
    const result = await runIdempotent(
      prisma,
      { userId, endpoint: "POST /loyalty/redemptions", key, body: req.body },
      async () => {
        const redemption = await redeemReward(prisma, userId, { rewardId, idempotencyKey: key });
        return { status: 201, body: { data: redemptionView(redemption) } };
      },
    );
    if (result.replayed) res.setHeader("Idempotent-Replayed", "true");
    res.status(result.status).json(result.body);
  });

  return router;
}

const redeemSchema = z.object({ rewardId: z.string().min(1).max(64) }).strict();

/** Datos públicos del programa (regla de puntos y recompensas). Sin autenticación. */
export function createLoyaltyProgramRouter(prisma: PrismaClient): Router {
  const router = Router();
  router.use(publicCache());
  router.get("/", async (_req, res) => {
    res.json({ data: await getLoyaltyProgram(prisma) });
  });
  return router;
}
