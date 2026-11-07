import type { PrismaClient } from "../../db/client.js";
import { paginationMeta } from "../../utils/pagination.js";

/** Cuenta de puntos del usuario. Se crea al crear el perfil; esto cubre perfiles anteriores. */
async function ensureAccount(prisma: PrismaClient, userId: string) {
  const existing = await prisma.loyaltyAccount.findUnique({ where: { userId } });
  if (existing) return existing;
  try {
    return await prisma.loyaltyAccount.create({ data: { userId } });
  } catch (error) {
    // Una petición simultánea la creó antes: se lee.
    if ((error as { code?: string } | null)?.code !== "P2002") throw error;
    return prisma.loyaltyAccount.findUniqueOrThrow({ where: { userId } });
  }
}

function activeRewardsFilter(now: Date) {
  return {
    active: true,
    deletedAt: null,
    AND: [
      { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
      { OR: [{ validTo: null }, { validTo: { gte: now } }] },
    ],
  };
}

export async function listRewards(prisma: PrismaClient) {
  const rewards = await prisma.reward.findMany({
    where: activeRewardsFilter(new Date()),
    orderBy: [{ pointsCost: "asc" }, { sortOrder: "asc" }],
  });
  return rewards.map((reward) => ({
    id: reward.id,
    name: reward.name,
    description: reward.description,
    pointsCost: reward.pointsCost,
  }));
}

export async function getLoyaltyAccount(prisma: PrismaClient, userId: string) {
  const account = await ensureAccount(prisma, userId);
  const [settings, rewards] = await Promise.all([
    prisma.storeSettings.findUnique({ where: { id: 1 } }),
    listRewards(prisma),
  ]);

  // Siguiente recompensa que aún no alcanza: sirve para mostrar el progreso.
  const next = rewards.find((reward) => reward.pointsCost > account.balance) ?? null;
  const previousCost =
    [...rewards].reverse().find((reward) => reward.pointsCost <= account.balance)?.pointsCost ?? 0;

  return {
    balance: account.balance,
    lifetimeEarned: account.lifetimeEarned,
    pointsPerEuro: settings ? settings.loyaltyPointsPerEuro.toString() : null,
    expiryDays: settings?.loyaltyExpiryDays ?? null,
    nextReward: next
      ? {
          id: next.id,
          name: next.name,
          pointsCost: next.pointsCost,
          pointsMissing: next.pointsCost - account.balance,
          // Progreso entre la recompensa anterior alcanzada y la siguiente (0 a 1).
          progress: Math.min(
            1,
            Math.max(0, (account.balance - previousCost) / (next.pointsCost - previousCost)),
          ),
        }
      : null,
    availableRewards: rewards.filter((reward) => reward.pointsCost <= account.balance).length,
  };
}

export async function listTransactions(
  prisma: PrismaClient,
  userId: string,
  paging: { page: number; pageSize: number; skip: number; take: number },
) {
  const account = await ensureAccount(prisma, userId);
  const where = { accountId: account.id };
  const [rows, total] = await Promise.all([
    prisma.loyaltyTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: paging.skip,
      take: paging.take,
      include: { order: { select: { orderNumber: true } } },
    }),
    prisma.loyaltyTransaction.count({ where }),
  ]);

  return {
    data: rows.map((row) => ({
      id: row.id,
      type: row.type,
      points: row.points,
      balanceAfter: row.balanceAfter,
      reason: row.reason,
      orderNumber: row.order?.orderNumber ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
    meta: paginationMeta(paging.page, paging.pageSize, total),
  };
}
