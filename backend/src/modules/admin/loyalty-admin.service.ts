import { z } from "zod";

import type { Prisma, PrismaClient } from "../../db/client.js";
import { HttpError, notFound } from "../../errors.js";
import { recordAudit } from "../../utils/audit.js";
import { paginationMeta } from "../../utils/pagination.js";
import { ensureAccount } from "../loyalty/ledger.service.js";

const money = (value: Prisma.Decimal | null) => (value ? value.toFixed(2) : null);
const uuid = z.uuid();
const date = z.iso.datetime();

type Paging = { page: number; pageSize: number; skip: number; take: number };

// ───────────────────────────── Regla de puntos ─────────────────────────────

export const loyaltySettingsSchema = z
  .object({
    /** Puntos por euro de productos (hasta 4 decimales). 0 desactiva la acumulación. */
    pointsPerEuro: z.string().regex(/^\d{1,3}(\.\d{1,4})?$/, "Invalid number"),
    /** Días hasta que caducan los puntos; null = no caducan. */
    expiryDays: z.number().int().min(1).max(3650).nullable(),
  })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

export async function getLoyaltySettings(prisma: PrismaClient) {
  const settings = await prisma.storeSettings.findUnique({ where: { id: 1 } });
  if (!settings)
    throw new HttpError(503, "STORE_NOT_CONFIGURED", "The store is not configured yet");
  return {
    pointsPerEuro: settings.loyaltyPointsPerEuro.toString(),
    expiryDays: settings.loyaltyExpiryDays,
  };
}

export async function updateLoyaltySettings(prisma: PrismaClient, actorId: string, body: unknown) {
  const input = loyaltySettingsSchema.parse(body);
  await prisma.$transaction(async (tx) => {
    const before = await tx.storeSettings.findUnique({ where: { id: 1 } });
    if (!before)
      throw new HttpError(503, "STORE_NOT_CONFIGURED", "The store is not configured yet");
    const after = await tx.storeSettings.update({
      where: { id: 1 },
      data: {
        ...(input.pointsPerEuro !== undefined ? { loyaltyPointsPerEuro: input.pointsPerEuro } : {}),
        ...(input.expiryDays !== undefined ? { loyaltyExpiryDays: input.expiryDays } : {}),
      },
    });
    await recordAudit(tx, {
      actorId,
      action: "loyalty.settings",
      entityType: "StoreSettings",
      entityId: "1",
      before: {
        pointsPerEuro: before.loyaltyPointsPerEuro.toString(),
        expiryDays: before.loyaltyExpiryDays,
      },
      after: {
        pointsPerEuro: after.loyaltyPointsPerEuro.toString(),
        expiryDays: after.loyaltyExpiryDays,
      },
    });
  });
  return getLoyaltySettings(prisma);
}

// ───────────────────────────── Recompensas ─────────────────────────────

const rewardFields = {
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(200).nullable().optional(),
  pointsCost: z.number().int().min(1).max(1_000_000),
  /** Producto gratis... */
  freeProductId: uuid.nullable().optional(),
  /** ...o descuento fijo en euros (exactamente uno de los dos). */
  discountAmount: z
    .string()
    .regex(/^\d{1,6}(\.\d{1,2})?$/, "Invalid amount")
    .nullable()
    .optional(),
  stock: z.number().int().min(0).nullable().optional(),
  validFrom: date.nullable().optional(),
  validTo: date.nullable().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
};

export const rewardSchema = z
  .object(rewardFields)
  .strict()
  .superRefine((value, ctx) => {
    const hasProduct = Boolean(value.freeProductId);
    const hasDiscount = value.discountAmount != null && Number(value.discountAmount) > 0;
    if (hasProduct === hasDiscount) {
      ctx.addIssue({
        code: "custom",
        path: ["freeProductId"],
        message: "Choose a free product or a fixed discount, not both",
      });
    }
    if (
      value.validFrom &&
      value.validTo &&
      Date.parse(value.validTo) <= Date.parse(value.validFrom)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["validTo"],
        message: "The end must be after the start",
      });
    }
  });

export type RewardInput = z.infer<typeof rewardSchema>;

export const rewardPatchSchema = z
  .object(rewardFields)
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

const rewardInclude = {
  freeProduct: { select: { id: true, name: true } },
  _count: { select: { redemptions: true } },
} satisfies Prisma.RewardInclude;

function rewardView(reward: Prisma.RewardGetPayload<{ include: typeof rewardInclude }>) {
  return {
    id: reward.id,
    name: reward.name,
    description: reward.description,
    pointsCost: reward.pointsCost,
    freeProduct: reward.freeProduct,
    discountAmount: money(reward.discountAmount),
    stock: reward.stock,
    validFrom: reward.validFrom?.toISOString() ?? null,
    validTo: reward.validTo?.toISOString() ?? null,
    active: reward.active,
    sortOrder: reward.sortOrder,
    redemptions: reward._count.redemptions,
  };
}

export async function listAdminRewards(prisma: PrismaClient) {
  const rows = await prisma.reward.findMany({
    where: { deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { pointsCost: "asc" }],
    include: rewardInclude,
  });
  return rows.map(rewardView);
}

async function getReward(prisma: PrismaClient, id: string) {
  const row = await prisma.reward.findFirst({
    where: { id, deletedAt: null },
    include: rewardInclude,
  });
  if (!row) throw notFound("Reward not found");
  return rewardView(row);
}

async function assertProduct(tx: Prisma.TransactionClient, productId: string | null | undefined) {
  if (productId && !(await tx.product.findFirst({ where: { id: productId, deletedAt: null } }))) {
    throw new HttpError(422, "PRODUCT_NOT_FOUND", "The reward product does not exist");
  }
}

const rewardData = (input: RewardInput) => ({
  name: input.name,
  description: input.description ?? null,
  pointsCost: input.pointsCost,
  freeProductId: input.freeProductId ?? null,
  discountAmount: input.freeProductId ? null : (input.discountAmount ?? null),
  stock: input.stock ?? null,
  validFrom: input.validFrom ? new Date(input.validFrom) : null,
  validTo: input.validTo ? new Date(input.validTo) : null,
  active: input.active ?? true,
});

export async function createReward(prisma: PrismaClient, actorId: string, body: unknown) {
  const input = rewardSchema.parse(body);
  const id = await prisma.$transaction(async (tx) => {
    await assertProduct(tx, input.freeProductId);
    const last = await tx.reward.aggregate({ _max: { sortOrder: true } });
    const reward = await tx.reward.create({
      data: { ...rewardData(input), sortOrder: input.sortOrder ?? (last._max.sortOrder ?? -1) + 1 },
    });
    await recordAudit(tx, {
      actorId,
      action: "reward.create",
      entityType: "Reward",
      entityId: reward.id,
      after: { name: reward.name, pointsCost: reward.pointsCost },
    });
    return reward.id;
  });
  return getReward(prisma, id);
}

export async function updateReward(
  prisma: PrismaClient,
  actorId: string,
  id: string,
  body: unknown,
) {
  const patch = rewardPatchSchema.parse(body);
  if (!uuid.safeParse(id).success) throw notFound("Reward not found");
  await prisma.$transaction(async (tx) => {
    const before = await tx.reward.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw notFound("Reward not found");
    // Cambiar de «producto gratis» a «descuento» (o al revés) se expresa enviando el nuevo y null en el otro.
    const merged = rewardSchema.parse({
      name: before.name,
      description: before.description,
      pointsCost: before.pointsCost,
      freeProductId: before.freeProductId,
      discountAmount: money(before.discountAmount),
      stock: before.stock,
      validFrom: before.validFrom?.toISOString() ?? null,
      validTo: before.validTo?.toISOString() ?? null,
      active: before.active,
      ...patch,
    });
    await assertProduct(tx, merged.freeProductId);
    const after = await tx.reward.update({
      where: { id },
      data: {
        ...rewardData(merged),
        ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
      },
    });
    await recordAudit(tx, {
      actorId,
      action: "reward.update",
      entityType: "Reward",
      entityId: id,
      before: {
        name: before.name,
        pointsCost: before.pointsCost,
        active: before.active,
        stock: before.stock,
      },
      after: {
        name: after.name,
        pointsCost: after.pointsCost,
        active: after.active,
        stock: after.stock,
        changed: Object.keys(patch),
      },
    });
  });
  return getReward(prisma, id);
}

/** Borrado lógico: deja de ofrecerse; los canjes ya hechos siguen siendo válidos. */
export async function deleteReward(prisma: PrismaClient, actorId: string, id: string) {
  if (!uuid.safeParse(id).success) throw notFound("Reward not found");
  await prisma.$transaction(async (tx) => {
    const reward = await tx.reward.findFirst({ where: { id, deletedAt: null } });
    if (!reward) throw notFound("Reward not found");
    await tx.reward.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
    await recordAudit(tx, {
      actorId,
      action: "reward.delete",
      entityType: "Reward",
      entityId: id,
      before: { name: reward.name },
    });
  });
}

// ───────────────────────────── Movimientos y canjes ─────────────────────────────

export const transactionsQuerySchema = z.object({
  type: z.enum(["EARN", "REDEEM", "REVERSAL", "ADJUSTMENT", "EXPIRATION"]).optional(),
  userId: uuid.optional(),
  q: z.string().trim().min(1).max(80).optional(),
});

/** Libro de movimientos de todos los clientes, con filtros y paginación. */
export async function listAdminTransactions(prisma: PrismaClient, query: unknown, paging: Paging) {
  const filters = transactionsQuerySchema.parse(query);
  const where: Prisma.LoyaltyTransactionWhereInput = {
    ...(filters.type ? { type: filters.type } : {}),
    account: {
      ...(filters.userId ? { userId: filters.userId } : {}),
      ...(filters.q
        ? {
            user: {
              OR: [
                { email: { contains: filters.q, mode: "insensitive" } },
                { fullName: { contains: filters.q, mode: "insensitive" } },
              ],
            },
          }
        : {}),
    },
  };
  const [rows, total] = await Promise.all([
    prisma.loyaltyTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: paging.skip,
      take: paging.take,
      include: {
        account: { include: { user: { select: { id: true, fullName: true, email: true } } } },
        order: { select: { orderNumber: true } },
        createdBy: { select: { fullName: true } },
      },
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
      createdBy: row.createdBy?.fullName ?? null,
      customer: row.account.user,
    })),
    meta: paginationMeta(paging.page, paging.pageSize, total),
  };
}

export const redemptionsQuerySchema = z.object({
  status: z.enum(["AVAILABLE", "USED", "CANCELLED", "EXPIRED"]).optional(),
});

export async function listAdminRedemptions(prisma: PrismaClient, query: unknown, paging: Paging) {
  const filters = redemptionsQuerySchema.parse(query);
  const where: Prisma.RewardRedemptionWhereInput = {
    ...(filters.status ? { status: filters.status } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.rewardRedemption.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: paging.skip,
      take: paging.take,
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        order: { select: { orderNumber: true } },
      },
    }),
    prisma.rewardRedemption.count({ where }),
  ]);
  return {
    data: rows.map((row) => ({
      id: row.id,
      rewardName: row.rewardName,
      pointsSpent: row.pointsSpent,
      status: row.status,
      orderNumber: row.order?.orderNumber ?? null,
      createdAt: row.createdAt.toISOString(),
      usedAt: row.usedAt?.toISOString() ?? null,
      customer: row.user,
    })),
    meta: paginationMeta(paging.page, paging.pageSize, total),
  };
}

// ───────────────────────────── Clientes ─────────────────────────────

export const customersQuerySchema = z.object({ q: z.string().trim().min(1).max(80).optional() });

export async function listCustomers(prisma: PrismaClient, query: unknown, paging: Paging) {
  const { q } = customersQuerySchema.parse(query);
  const where: Prisma.ProfileWhereInput = {
    deletedAt: null,
    ...(q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" } },
            { fullName: { contains: q, mode: "insensitive" } },
            { username: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.profile.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: paging.skip,
      take: paging.take,
      include: { loyaltyAccount: true, _count: { select: { orders: true } } },
    }),
    prisma.profile.count({ where }),
  ]);
  return {
    data: rows.map((row) => ({
      id: row.id,
      fullName: row.fullName,
      username: row.username,
      email: row.email,
      phone: row.phone,
      orders: row._count.orders,
      balance: row.loyaltyAccount?.balance ?? 0,
      lifetimeEarned: row.loyaltyAccount?.lifetimeEarned ?? 0,
      createdAt: row.createdAt.toISOString(),
    })),
    meta: paginationMeta(paging.page, paging.pageSize, total),
  };
}

// ───────────────────────────── Ajuste de puntos ─────────────────────────────

export const adjustmentSchema = z
  .object({
    userId: uuid,
    points: z
      .number()
      .int()
      .refine((value) => value !== 0, "points must not be zero"),
    reason: z.string().trim().min(3).max(300),
  })
  .strict();

/** Saldo del cliente tras un ajuste (para que la pantalla lo muestre sin otra consulta). */
export async function balanceOf(prisma: PrismaClient, userId: string) {
  const account = await prisma.$transaction((tx) => ensureAccount(tx, userId));
  return account.balance;
}
