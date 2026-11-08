"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { z } from "zod";

import { useProfile } from "@/features/account/profile-context";
import { fetchProducts } from "@/features/catalog/api";
import type { Product } from "@/features/catalog/schemas";
import { apiRequest } from "@/lib/api";

import { toApiItems, useCartStore, lineId, type CartLine } from "./cart-store";

const serverCartSchema = z.object({
  items: z.array(
    z.object({
      productId: z.string(),
      quantity: z.number(),
      optionIds: z.array(z.string()),
      notes: z.string().nullable(),
    }),
  ),
});

type ServerItem = z.infer<typeof serverCartSchema>["items"][number];

/** Reconstruye las líneas para mostrar a partir de los identificadores del servidor y la carta. */
export function linesFromServer(
  items: readonly ServerItem[],
  products: readonly Product[],
): CartLine[] {
  const byId = new Map(products.map((product) => [product.id, product]));
  return items.flatMap((item) => {
    const product = byId.get(item.productId);
    if (!product) return [];
    const options = product.optionGroups.flatMap((group) => group.options);
    const labels = item.optionIds
      .map((id) => options.find((option) => option.id === id)?.name)
      .filter((name): name is string => Boolean(name));
    return [
      {
        id: lineId(item),
        productId: item.productId,
        name: product.name,
        imageUrl: product.image?.url ?? null,
        imageAlt: product.image?.alt ?? "",
        optionIds: item.optionIds,
        optionSummary: labels.join(", "),
        notes: item.notes,
        quantity: item.quantity,
      },
    ];
  });
}

/**
 * Sincroniza el carrito con el servidor para quien tiene sesión (así se ve igual en la web y en la
 * app). Política: al iniciar sesión, si este navegador tiene carrito se sube al servidor; si está
 * vacío, se recupera el del servidor. Después, cada cambio se guarda (con un pequeño retraso). Al
 * cerrar sesión se vacía el carrito local para no mezclarlo con el de otra persona.
 */
function useCartServerSync() {
  const { auth, token } = useProfile();
  const lines = useCartStore((state) => state.lines);
  const syncedToken = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const wasAuthenticated = useRef(false);

  useEffect(() => {
    if (auth.status === "authenticated") {
      wasAuthenticated.current = true;
    } else if (auth.status === "anonymous" && wasAuthenticated.current) {
      wasAuthenticated.current = false;
      syncedToken.current = null;
      useCartStore.getState().clear();
      setReady(false);
    }
  }, [auth.status]);

  // Primera sincronización de cada sesión.
  useEffect(() => {
    if (!token || syncedToken.current === token) return;
    syncedToken.current = token;
    let cancelled = false;
    (async () => {
      try {
        const local = useCartStore.getState().lines;
        if (local.length > 0) {
          await apiRequest("/cart", {
            token,
            method: "PUT",
            body: { items: toApiItems(local) },
            schema: serverCartSchema,
          });
        } else {
          const server = await apiRequest("/cart", { token, schema: serverCartSchema });
          if (server.items.length > 0 && !cancelled) {
            const products = await fetchProducts();
            if (!cancelled)
              useCartStore.getState().replace(linesFromServer(server.items, products));
          }
        }
        if (!cancelled) setReady(true);
      } catch {
        // Sin conexión con el servidor el carrito local sigue funcionando; se reintenta en la próxima sesión.
        syncedToken.current = null;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Guardado de cambios posteriores.
  useEffect(() => {
    if (!ready || !token) return;
    const timer = setTimeout(() => {
      apiRequest("/cart", {
        token,
        method: "PUT",
        body: { items: toApiItems(lines) },
        schema: serverCartSchema,
      }).catch(() => undefined);
    }, 800);
    return () => clearTimeout(timer);
  }, [lines, ready, token]);
}

function CartSync() {
  useCartServerSync();
  return null;
}

/** Datos remotos (TanStack Query), lectura del carrito guardado en el navegador y sincronización. */
export function CartProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient());

  useEffect(() => {
    void useCartStore.persist.rehydrate();
  }, []);

  return (
    <QueryClientProvider client={client}>
      <CartSync />
      {children}
    </QueryClientProvider>
  );
}
