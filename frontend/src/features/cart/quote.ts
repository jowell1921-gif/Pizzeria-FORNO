import { z } from "zod";

import { apiRequest } from "@/lib/api";

import { toApiItems, type CartLine } from "./cart-store";

export const quoteSchema = z.object({
  type: z.enum(["PICKUP", "DELIVERY"]),
  lines: z.array(
    z.object({
      productId: z.string(),
      productName: z.string(),
      quantity: z.number(),
      notes: z.string().nullable(),
      unitPrice: z.string(),
      lineTotal: z.string(),
      options: z.array(
        z.object({
          optionId: z.string(),
          group: z.string(),
          name: z.string(),
          priceDelta: z.string(),
        }),
      ),
    }),
  ),
  discounts: z.array(z.object({ description: z.string(), amount: z.string() })),
  totals: z.object({
    subtotal: z.string(),
    discount: z.string(),
    deliveryFee: z.string(),
    tax: z.string(),
    total: z.string(),
  }),
  delivery: z
    .object({
      postalCode: z.string().nullable(),
      covered: z.boolean(),
      zoneName: z.string().nullable(),
      minimumOrder: z.string().nullable(),
      belowMinimum: z.boolean(),
    })
    .nullable(),
  estimatedMinutes: z.number().nullable(),
  pointsToEarn: z.number(),
});

export type Quote = z.infer<typeof quoteSchema>;

export interface QuoteParams {
  type: "PICKUP" | "DELIVERY";
  postalCode?: string | null;
  /** Cupón o recompensa a validar: exigen sesión (`token`). */
  couponCode?: string | null;
  redemptionId?: string | null;
  token?: string | null;
}

/** Pide al servidor los importes del carrito. Público: no necesita sesión. */
export function fetchQuote(lines: readonly CartLine[], params: QuoteParams) {
  return apiRequest("/checkout/quote", {
    method: "POST",
    ...(params.token ? { token: params.token } : {}),
    body: {
      items: toApiItems(lines),
      type: params.type,
      ...(params.type === "DELIVERY" && params.postalCode ? { postalCode: params.postalCode } : {}),
      ...(params.couponCode ? { couponCode: params.couponCode } : {}),
      ...(params.redemptionId ? { redemptionId: params.redemptionId } : {}),
    },
    schema: quoteSchema,
  });
}
