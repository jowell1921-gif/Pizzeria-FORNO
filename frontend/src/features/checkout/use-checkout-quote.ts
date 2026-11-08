"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { toApiItems, useCartStore } from "@/features/cart/cart-store";
import { fetchQuote } from "@/features/cart/quote";
import { useCartQuote } from "@/features/cart/use-cart-quote";
import { ApiError } from "@/lib/api";

interface CheckoutQuoteParams {
  type: "PICKUP" | "DELIVERY";
  postalCode: string | null;
  token: string | null;
  couponCode: string | null;
  redemptionId: string | null;
}

/**
 * Presupuesto del pedido con cupón y recompensa. Se piden siempre los importes sin descuentos y, si
 * hay cupón o recompensa, también con ellos. Si el servidor rechaza el cupón o la recompensa, se
 * siguen mostrando los importes sin descuento y se devuelve el error para explicarlo.
 */
export function useCheckoutQuote(params: CheckoutQuoteParams) {
  const lines = useCartStore((state) => state.lines);
  const base = useCartQuote({ type: params.type, postalCode: params.postalCode });

  const wantsDiscount = Boolean(params.couponCode || params.redemptionId) && Boolean(params.token);
  const postalCode = params.type === "DELIVERY" ? params.postalCode : null;
  const discounted = useQuery({
    queryKey: [
      "quote-discounted",
      params.type,
      postalCode,
      params.couponCode,
      params.redemptionId,
      JSON.stringify(toApiItems(lines)),
    ],
    queryFn: () => fetchQuote(lines, params),
    enabled: wantsDiscount && lines.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    retry: false,
  });

  const discountError =
    wantsDiscount && discounted.error instanceof ApiError ? discounted.error : null;
  const data = wantsDiscount && !discountError ? (discounted.data ?? base.data) : base.data;

  return {
    data,
    /** Error al calcular los importes básicos (productos que cambiaron, etc.). */
    isError: base.isError,
    /** Error de cupón o recompensa; los importes mostrados no los incluyen. */
    discountError,
    discountPending: wantsDiscount && discounted.isFetching,
  };
}
