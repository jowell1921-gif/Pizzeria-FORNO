import { z } from "zod";

import type { Prisma, PrismaClient } from "../../db/client.js";
import { conflict, HttpError, notFound } from "../../errors.js";

/** Cliente de base de datos dentro de una transacción (o el cliente normal en operaciones sueltas). */
export type Db = Prisma.TransactionClient;

const INSUFFICIENT = /Insufficient loyalty points/i;

const isInsufficientPoints = (error: unknown) =>
  error instanceof Error && INSUFFICIENT.test(error.message);

/** Cuenta de puntos del usuario; se crea si aún no existe (perfiles anteriores a FORNEA CLUB). */
export async function ensureAccount(db: Db, userId: string) {
  const existing = await db.loyaltyAccount.findUnique({ where: { userId } });
  return existing ?? db.loyaltyAccount.create({ data: { userId } });
}

/** Bloquea la fila del pedido hasta el final de la transacción: serializa los cambios de un mismo pedido. */
export async function lockOrder(db: Db, orderId: string): Promise<void> {
  await db.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId}::uuid FOR UPDATE`;
}

/**
 * Concede los puntos de un pedido completado. Es idempotente: un pedido solo puede conceder puntos
 * una vez (índice único en la base de datos y comprobación previa).
 *
 * Puntos = importe elegible × puntos por euro (según la configuración al completar el pedido),
 * redondeado hacia abajo. Importe elegible = productos − descuentos. El gasto de envío nunca puntúa;
 * los precios incluyen IVA y esa es la cantidad que paga el cliente (regla documentada en 0008).
 * Llamar siempre dentro de una transacción con el pedido bloqueado (`lockOrder`).
 */
export async function earnPointsForOrder(db: Db, orderId: string) {
  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { id: true, userId: true, status: true, subtotal: true, discountTotal: true },
  });
  if (order.status !== "COMPLETED") {
    throw conflict("ORDER_NOT_COMPLETED", "Points are only granted for completed orders");
  }

  const existing = await db.loyaltyTransaction.findFirst({ where: { orderId, type: "EARN" } });
  if (existing) return { points: existing.points, created: false };

  const settings = await db.storeSettings.findUnique({ where: { id: 1 } });
  const eligible = order.subtotal.sub(order.discountTotal);
  const points = settings ? eligible.mul(settings.loyaltyPointsPerEuro).floor().toNumber() : 0;
  if (points <= 0) return { points: 0, created: false };

  const account = await ensureAccount(db, order.userId);
  await db.loyaltyTransaction.create({
    data: {
      accountId: account.id,
      type: "EARN",
      points,
      orderId,
      idempotencyKey: `earn:${orderId}`,
    },
  });
  return { points, created: true };
}

/**
 * Revierte los efectos de fidelización de un pedido cancelado o devuelto:
 *
 * - Puntos ganados: se retiran hasta el saldo disponible (el saldo nunca queda negativo).
 * - Puntos gastados en una recompensa usada en este pedido: se devuelven completos y la recompensa
 *   canjeada pasa a «cancelada».
 *
 * Es idempotente. Llamar dentro de una transacción con el pedido bloqueado.
 */
export async function reversePointsForOrder(db: Db, orderId: string, reason: string) {
  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { userId: true },
  });
  const account = await ensureAccount(db, order.userId);
  let earnedReversed = 0;
  let redeemedRefunded = 0;

  const earn = await db.loyaltyTransaction.findFirst({ where: { orderId, type: "EARN" } });
  const reversed = await db.loyaltyTransaction.findFirst({
    where: { orderId, type: "REVERSAL", redemptionId: null },
  });
  if (earn && !reversed) {
    const current = await db.loyaltyAccount.findUniqueOrThrow({ where: { id: account.id } });
    const amount = Math.min(earn.points, current.balance);
    if (amount > 0) {
      await db.loyaltyTransaction.create({
        data: {
          accountId: account.id,
          type: "REVERSAL",
          points: -amount,
          orderId,
          reason,
          idempotencyKey: `reverse-earn:${orderId}`,
        },
      });
      earnedReversed = amount;
    }
  }

  const used = await db.rewardRedemption.findMany({ where: { orderId, status: "USED" } });
  for (const redemption of used) {
    await db.loyaltyTransaction.create({
      data: {
        accountId: account.id,
        type: "REVERSAL",
        points: redemption.pointsSpent,
        redemptionId: redemption.id,
        reason,
        idempotencyKey: `reverse-redeem:${redemption.id}`,
      },
    });
    await db.rewardRedemption.update({
      where: { id: redemption.id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    await db.reward.updateMany({
      where: { id: redemption.rewardId, stock: { not: null } },
      data: { stock: { increment: 1 } },
    });
    redeemedRefunded += redemption.pointsSpent;
  }

  return { earnedReversed, redeemedRefunded };
}

/**
 * Canjea una recompensa: descuenta los puntos y crea la recompensa en la «cartera» del cliente
 * (estado disponible) para usarla en un pedido.
 *
 * Seguridad ante peticiones simultáneas: el trigger del libro bloquea la cuenta (`FOR UPDATE`) y
 * rechaza saldos negativos, de modo que dos canjes a la vez nunca consumen los mismos puntos. Si
 * algo falla, la transacción entera se deshace (ni puntos descontados ni recompensa creada).
 */
export async function redeemReward(
  prisma: PrismaClient,
  userId: string,
  input: { rewardId: string; idempotencyKey?: string },
  now = new Date(),
) {
  if (!z.uuid().safeParse(input.rewardId).success) throw notFound("Reward not found");

  try {
    return await prisma.$transaction(async (tx) => {
      const reward = await tx.reward.findFirst({
        where: {
          id: input.rewardId,
          active: true,
          deletedAt: null,
          AND: [
            { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
            { OR: [{ validTo: null }, { validTo: { gte: now } }] },
          ],
        },
      });
      if (!reward) throw notFound("Reward not found");

      const account = await ensureAccount(tx, userId);
      if (account.balance < reward.pointsCost) {
        throw new HttpError(409, "INSUFFICIENT_POINTS", "You do not have enough points");
      }

      if (reward.stock !== null) {
        const taken = await tx.reward.updateMany({
          where: { id: reward.id, stock: { gt: 0 } },
          data: { stock: { decrement: 1 } },
        });
        if (taken.count === 0) {
          throw new HttpError(409, "REWARD_OUT_OF_STOCK", "This reward is out of stock");
        }
      }

      const redemption = await tx.rewardRedemption.create({
        data: {
          userId,
          rewardId: reward.id,
          rewardName: reward.name,
          pointsSpent: reward.pointsCost,
          idempotencyKey: input.idempotencyKey ? `redeem:${userId}:${input.idempotencyKey}` : null,
        },
      });
      await tx.loyaltyTransaction.create({
        data: {
          accountId: account.id,
          type: "REDEEM",
          points: -reward.pointsCost,
          redemptionId: redemption.id,
          idempotencyKey: `redeem:${redemption.id}`,
        },
      });
      return redemption;
    });
  } catch (error) {
    // Otra solicitud simultánea consumió los puntos entre la comprobación y el movimiento.
    if (isInsufficientPoints(error)) {
      throw new HttpError(409, "INSUFFICIENT_POINTS", "You do not have enough points");
    }
    throw error;
  }
}

export const adjustPointsSchema = z
  .object({
    points: z
      .number()
      .int()
      .refine((value) => value !== 0, "points must not be zero"),
    reason: z.string().trim().min(3).max(300),
  })
  .strict();

/**
 * Ajuste administrativo de puntos (positivo o negativo). Exige motivo, queda en el libro como
 * movimiento y en el registro de auditoría; nunca se edita el saldo directamente.
 */
export async function adjustPoints(
  prisma: PrismaClient,
  input: { userId: string; actorId: string; points: number; reason: string },
) {
  const parsed = adjustPointsSchema.parse({ points: input.points, reason: input.reason });
  try {
    return await prisma.$transaction(async (tx) => {
      const profile = await tx.profile.findUnique({ where: { id: input.userId } });
      if (!profile) throw notFound("Customer not found");
      const account = await ensureAccount(tx, input.userId);
      const entry = await tx.loyaltyTransaction.create({
        data: {
          accountId: account.id,
          type: "ADJUSTMENT",
          points: parsed.points,
          reason: parsed.reason,
          createdById: input.actorId,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: input.actorId,
          action: "loyalty.adjust",
          entityType: "LoyaltyAccount",
          entityId: account.id,
          before: { balance: account.balance },
          after: { balance: entry.balanceAfter, points: parsed.points },
          reason: parsed.reason,
        },
      });
      return entry;
    });
  } catch (error) {
    if (isInsufficientPoints(error)) {
      throw new HttpError(
        409,
        "INSUFFICIENT_POINTS",
        "The adjustment would leave a negative balance",
      );
    }
    throw error;
  }
}
