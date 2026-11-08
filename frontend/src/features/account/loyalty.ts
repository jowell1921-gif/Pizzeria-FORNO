import { z } from "zod";

import { apiRequest, apiRequestPage } from "@/lib/api";

const benefitSchema = z.object({
  type: z.enum(["FREE_PRODUCT", "DISCOUNT"]),
  productId: z.string().nullable(),
  productName: z.string().nullable(),
  amount: z.string().nullable(),
});

export const loyaltyAccountSchema = z.object({
  balance: z.number(),
  lifetimeEarned: z.number(),
  pointsPerEuro: z.string().nullable(),
  expiryDays: z.number().nullable(),
  availableRewards: z.number(),
  nextReward: z
    .object({
      id: z.string(),
      name: z.string(),
      pointsCost: z.number(),
      pointsMissing: z.number(),
      progress: z.number(),
    })
    .nullable(),
});

export const rewardSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  pointsCost: z.number(),
  benefit: benefitSchema,
  inStock: z.boolean(),
});

export const redemptionSchema = z.object({
  id: z.string(),
  rewardId: z.string(),
  rewardName: z.string(),
  pointsSpent: z.number(),
  status: z.enum(["AVAILABLE", "USED", "CANCELLED", "EXPIRED"]),
  benefit: benefitSchema.nullable(),
  orderNumber: z.number().nullable(),
  createdAt: z.string(),
  usedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
});

export const transactionSchema = z.object({
  id: z.string(),
  type: z.enum(["EARN", "REDEEM", "REVERSAL", "ADJUSTMENT", "EXPIRATION"]),
  points: z.number(),
  balanceAfter: z.number(),
  reason: z.string().nullable(),
  orderNumber: z.number().nullable(),
  createdAt: z.string(),
});

export type LoyaltyAccount = z.infer<typeof loyaltyAccountSchema>;
export type Reward = z.infer<typeof rewardSchema>;
export type Redemption = z.infer<typeof redemptionSchema>;
export type Benefit = z.infer<typeof benefitSchema>;
export type LoyaltyTransaction = z.infer<typeof transactionSchema>;

export const TRANSACTION_LABELS: Record<LoyaltyTransaction["type"], string> = {
  EARN: "Puntos ganados",
  REDEEM: "Canje de recompensa",
  REVERSAL: "Devolución de puntos",
  ADJUSTMENT: "Ajuste",
  EXPIRATION: "Puntos caducados",
};

export const fetchLoyaltyAccount = (token: string) =>
  apiRequest("/loyalty/account", { token, schema: loyaltyAccountSchema });

export const fetchRewards = (token: string) =>
  apiRequest("/loyalty/rewards", { token, schema: z.array(rewardSchema) });

export const fetchRecentTransactions = async (token: string) =>
  (
    await apiRequestPage("/loyalty/transactions", {
      token,
      query: { page: 1, pageSize: 5 },
      schema: transactionSchema,
    })
  ).data;

export const REDEMPTION_STATUS_LABELS: Record<Redemption["status"], string> = {
  AVAILABLE: "Disponible",
  USED: "Usada",
  CANCELLED: "Cancelada (puntos devueltos)",
  EXPIRED: "Caducada",
};

/** Qué da una recompensa, en palabras del cliente. */
export function benefitText(benefit: Benefit | null): string {
  if (!benefit) return "";
  return benefit.type === "FREE_PRODUCT"
    ? `Producto gratis: ${benefit.productName ?? ""}`
    : `Descuento de ${benefit.amount ?? ""} €`;
}

export const fetchRedemptions = async (token: string, status?: Redemption["status"]) =>
  (
    await apiRequestPage("/loyalty/redemptions", {
      token,
      query: { page: 1, pageSize: 50, ...(status ? { status } : {}) },
      schema: redemptionSchema,
    })
  ).data;

export const fetchAvailableRedemptions = (token: string) => fetchRedemptions(token, "AVAILABLE");

/** El canje lleva una clave de idempotencia: un reintento no descuenta los puntos dos veces. */
export const redeemReward = (token: string, rewardId: string, idempotencyKey: string) =>
  apiRequest("/loyalty/redemptions", {
    token,
    method: "POST",
    body: { rewardId },
    headers: { "Idempotency-Key": idempotencyKey },
    schema: redemptionSchema,
  });
