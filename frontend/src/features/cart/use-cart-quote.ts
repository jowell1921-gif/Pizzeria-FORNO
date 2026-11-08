"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { toApiItems, useCartStore } from "./cart-store";
import { fetchQuote, type QuoteParams } from "./quote";

/**
 * Presupuesto del carrito calculado por el servidor. Se vuelve a pedir cuando cambian las líneas,
 * la modalidad o el código postal; mientras llega el nuevo, se sigue mostrando el anterior.
 */
export function useCartQuote(params: QuoteParams) {
  const lines = useCartStore((state) => state.lines);
  const postalCode = params.type === "DELIVERY" ? (params.postalCode ?? null) : null;

  return useQuery({
    queryKey: ["quote", params.type, postalCode, JSON.stringify(toApiItems(lines))],
    queryFn: () => fetchQuote(lines, { type: params.type, postalCode }),
    enabled: lines.length > 0,
    placeholderData: keepPreviousData,
    // Los precios pueden cambiar en cualquier momento: no se reutiliza un presupuesto antiguo.
    staleTime: 15_000,
    retry: false,
  });
}
