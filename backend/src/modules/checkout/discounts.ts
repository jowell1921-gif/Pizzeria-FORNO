import { z } from "zod";

import { Prisma } from "../../db/client.js";
import { HttpError } from "../../errors.js";
import type { Db } from "../loyalty/ledger.service.js";
import { cents, type PricedLine } from "./pricing.js";

const ZERO = new Prisma.Decimal(0);
/** Un pedido anulado no cuenta para los límites de uso de cupones ni para «primer pedido». */
const ACTIVE_ORDER = { notIn: ["CANCELLED", "REJECTED"] as ("CANCELLED" | "REJECTED")[] };

export const couponCodeSchema = z
  .string()
  .trim()
  .max(32)
  .transform((value) => value.toUpperCase());

export interface AppliedDiscount {
  description: string;
  amount: Prisma.Decimal;
  promotionId?: string;
  couponId?: string;
  couponCode?: string;
  rewardRedemptionId?: string;
}

const invalid = (code: string, message: string, details?: unknown) =>
  new HttpError(422, code, message, details);

/** Distribuye un descuento entre las líneas en proporción a su importe (el resto, a las mayores). */
export function allocateDiscount(lines: readonly PricedLine[], discount: Prisma.Decimal) {
  const subtotal = lines.reduce((sum, line) => sum.add(line.lineTotal), ZERO);
  if (discount.lessThanOrEqualTo(ZERO) || subtotal.lessThanOrEqualTo(ZERO)) {
    return lines.map(() => ZERO);
  }
  const shares = lines.map((line) =>
    line.lineTotal.mul(discount).div(subtotal).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN),
  );
  let remainder = discount.sub(shares.reduce((sum, share) => sum.add(share), ZERO));
  const order = lines
    .map((line, index) => ({ index, total: line.lineTotal }))
    .sort((a, b) => b.total.comparedTo(a.total));
  for (let i = 0; remainder.greaterThan(ZERO); i = (i + 1) % order.length) {
    const target = order[i]!.index;
    shares[target] = shares[target]!.add("0.01");
    remainder = remainder.sub("0.01");
  }
  return shares;
}

/**
 * Valida un cupón para este cliente y este carrito, y calcula su descuento. Todas las reglas se
 * comprueban aquí, en el servidor: fechas, estado, uso máximo, uso por cliente, primer pedido,
 * importe mínimo y productos a los que se aplica. Se lanza un error con un código concreto para
 * que la interfaz pueda explicarlo.
 */
export async function evaluateCoupon(
  db: Db,
  input: {
    userId: string;
    code: string;
    lines: readonly PricedLine[];
    subtotal: Prisma.Decimal;
    now: Date;
  },
): Promise<AppliedDiscount> {
  const code = input.code.trim().toUpperCase();
  const coupon = /^[A-Z0-9_-]{3,32}$/.test(code)
    ? await db.coupon.findUnique({
        where: { code },
        include: { promotion: { include: { products: true } } },
      })
    : null;
  // Un cupón personal de otra persona se trata como si no existiera (no se revela).
  if (!coupon || (coupon.userId && coupon.userId !== input.userId)) {
    throw invalid("COUPON_NOT_FOUND", "This coupon code does not exist");
  }
  const { promotion } = coupon;
  if (!coupon.active || !promotion.active || promotion.deletedAt) {
    throw invalid("COUPON_INACTIVE", "This coupon is not active");
  }
  const starts = [coupon.startsAt, promotion.startsAt].filter(
    (date): date is Date => date !== null,
  );
  if (starts.some((date) => date > input.now)) {
    throw invalid("COUPON_NOT_STARTED", "This coupon is not valid yet");
  }
  const ends = [coupon.endsAt, promotion.endsAt].filter((date): date is Date => date !== null);
  if (ends.some((date) => date < input.now)) {
    throw invalid("COUPON_EXPIRED", "This coupon has expired");
  }

  if (promotion.minSubtotal && input.subtotal.lessThan(promotion.minSubtotal)) {
    throw invalid("COUPON_MIN_SUBTOTAL", "The order does not reach the minimum for this coupon", {
      minSubtotal: promotion.minSubtotal.toFixed(2),
    });
  }

  if (promotion.firstOrderOnly) {
    const previous = await db.order.count({
      where: { userId: input.userId, status: ACTIVE_ORDER },
    });
    if (previous > 0)
      throw invalid("COUPON_NOT_FIRST_ORDER", "This coupon is only valid for a first order");
  }

  const used = (where: Prisma.CouponRedemptionWhereInput) =>
    db.couponRedemption.count({ where: { ...where, order: { status: ACTIVE_ORDER } } });
  if (
    coupon.maxRedemptions !== null &&
    (await used({ couponId: coupon.id })) >= coupon.maxRedemptions
  ) {
    throw invalid("COUPON_USED_UP", "This coupon has no uses left");
  }
  if (
    promotion.maxRedemptions !== null &&
    (await used({ coupon: { promotionId: promotion.id } })) >= promotion.maxRedemptions
  ) {
    throw invalid("COUPON_USED_UP", "This promotion has no uses left");
  }
  if (
    coupon.perUserLimit !== null &&
    (await used({ couponId: coupon.id, userId: input.userId })) >= coupon.perUserLimit
  ) {
    throw invalid("COUPON_ALREADY_USED", "You have already used this coupon");
  }
  if (
    promotion.perUserLimit !== null &&
    (await used({ coupon: { promotionId: promotion.id }, userId: input.userId })) >=
      promotion.perUserLimit
  ) {
    throw invalid("COUPON_ALREADY_USED", "You have already used this promotion");
  }

  let amount: Prisma.Decimal;
  const restricted = new Map(promotion.products.map((item) => [item.productId, item.quantity]));
  if (promotion.kind === "COMBO") {
    // Combo: el cliente debe llevar las unidades indicadas; paga el precio cerrado en su lugar.
    if (restricted.size === 0 || promotion.comboPrice === null) {
      throw invalid("COUPON_NOT_APPLICABLE", "This combo cannot be applied to this order");
    }
    let normal = ZERO;
    for (const [productId, quantity] of restricted) {
      const units = input.lines
        .filter((line) => line.productId === productId)
        .flatMap((line) => Array.from({ length: line.quantity }, () => line.unitPrice))
        .sort((a, b) => a.comparedTo(b));
      if (units.length < quantity) {
        throw invalid(
          "COUPON_NOT_APPLICABLE",
          "The order does not include the products of this combo",
        );
      }
      normal = units.slice(0, quantity).reduce((sum, price) => sum.add(price), normal);
    }
    amount = normal.sub(promotion.comboPrice);
  } else {
    const base =
      restricted.size === 0
        ? input.subtotal
        : input.lines
            .filter((line) => restricted.has(line.productId))
            .reduce((sum, line) => sum.add(line.lineTotal), ZERO);
    if (
      base.lessThanOrEqualTo(ZERO) ||
      promotion.discountType === null ||
      promotion.discountValue === null
    ) {
      throw invalid(
        "COUPON_NOT_APPLICABLE",
        "This coupon does not apply to the products in your order",
      );
    }
    amount =
      promotion.discountType === "PERCENT"
        ? cents(base.mul(promotion.discountValue).div(100))
        : Prisma.Decimal.min(promotion.discountValue, base);
  }

  amount = cents(Prisma.Decimal.min(amount, input.subtotal));
  if (amount.lessThanOrEqualTo(ZERO)) {
    throw invalid("COUPON_NOT_APPLICABLE", "This coupon would not reduce the price of your order");
  }
  return {
    description: `${promotion.name} (${coupon.code})`,
    amount,
    promotionId: promotion.id,
    couponId: coupon.id,
    couponCode: coupon.code,
  };
}

/**
 * Valida una recompensa ya canjeada (en la «cartera» del cliente) para este pedido y calcula su
 * descuento: el precio de una unidad del producto gratis, o el importe fijo (sin pasar del total).
 */
export async function evaluateRedemption(
  db: Db,
  input: {
    userId: string;
    redemptionId: string;
    lines: readonly PricedLine[];
    /** Importe de productos que queda por pagar tras otros descuentos. */
    remaining: Prisma.Decimal;
    now: Date;
  },
): Promise<AppliedDiscount> {
  const redemption = await db.rewardRedemption.findFirst({
    where: { id: input.redemptionId, userId: input.userId, status: "AVAILABLE" },
    include: { reward: { include: { freeProduct: true } } },
  });
  if (!redemption || (redemption.expiresAt && redemption.expiresAt < input.now)) {
    throw invalid("REDEMPTION_NOT_AVAILABLE", "This reward is not available");
  }
  const { reward } = redemption;

  let amount = ZERO;
  if (reward.freeProductId) {
    const prices = input.lines
      .filter((line) => line.productId === reward.freeProductId)
      .map((line) => line.unitPrice)
      .sort((a, b) => a.comparedTo(b));
    if (prices.length === 0) {
      throw invalid(
        "REWARD_NOT_APPLICABLE",
        `Add ${reward.freeProduct?.name ?? "the reward product"} to your order to use this reward`,
      );
    }
    amount = prices[0]!;
  } else if (reward.discountAmount) {
    amount = reward.discountAmount;
  }
  amount = cents(Prisma.Decimal.min(amount, input.remaining));
  if (amount.lessThanOrEqualTo(ZERO)) {
    throw invalid("REWARD_NOT_APPLICABLE", "This reward would not reduce the price of your order");
  }
  return {
    description: `Recompensa: ${redemption.rewardName}`,
    amount,
    rewardRedemptionId: redemption.id,
  };
}

/** Cupón y recompensa del pedido, en ese orden; el total descontado nunca supera los productos. */
export async function evaluateDiscounts(
  db: Db,
  input: {
    userId: string | null;
    couponCode?: string | undefined;
    redemptionId?: string | undefined;
    lines: readonly PricedLine[];
    subtotal: Prisma.Decimal;
    now: Date;
  },
): Promise<AppliedDiscount[]> {
  const wantsDiscount = Boolean(input.couponCode?.trim() || input.redemptionId);
  if (!wantsDiscount) return [];
  if (!input.userId) {
    throw new HttpError(401, "UNAUTHENTICATED", "Sign in to use coupons and rewards");
  }

  const applied: AppliedDiscount[] = [];
  let remaining = input.subtotal;
  if (input.couponCode?.trim()) {
    const coupon = await evaluateCoupon(db, {
      userId: input.userId,
      code: input.couponCode,
      lines: input.lines,
      subtotal: input.subtotal,
      now: input.now,
    });
    applied.push(coupon);
    remaining = remaining.sub(coupon.amount);
  }
  if (input.redemptionId) {
    applied.push(
      await evaluateRedemption(db, {
        userId: input.userId,
        redemptionId: input.redemptionId,
        lines: input.lines,
        remaining,
        now: input.now,
      }),
    );
  }
  return applied;
}
