import { z } from "zod";

import { apiRequest, apiRequestPage } from "@/lib/api";

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
