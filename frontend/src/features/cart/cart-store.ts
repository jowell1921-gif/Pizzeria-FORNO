import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export const MAX_LINE_QUANTITY = 20;
export const MAX_CART_LINES = 30;

/**
 * Línea del carrito. Solo guarda qué quiere el cliente (producto, opciones, cantidad) y unos datos
 * para mostrarla sin conexión: los importes reales los calcula siempre el servidor (presupuesto).
 */
export interface CartLine {
  /** Firma de la línea: mismo producto, opciones y nota => misma línea. */
  id: string;
  productId: string;
  name: string;
  imageUrl: string | null;
  imageAlt: string;
  optionIds: string[];
  optionSummary: string;
  notes: string | null;
  quantity: number;
}

export type NewCartLine = Omit<CartLine, "id" | "quantity"> & { quantity?: number };

export function lineId(line: Pick<CartLine, "productId" | "optionIds" | "notes">): string {
  return `${line.productId}|${[...line.optionIds].sort().join(",")}|${line.notes ?? ""}`;
}

interface CartState {
  lines: CartLine[];
  add: (line: NewCartLine) => void;
  setQuantity: (id: string, quantity: number) => void;
  remove: (id: string) => void;
  clear: () => void;
  replace: (lines: CartLine[]) => void;
}

const clamp = (quantity: number) => Math.min(MAX_LINE_QUANTITY, Math.max(1, Math.round(quantity)));

/**
 * Carrito del navegador. Se guarda en localStorage para recuperarlo al volver; para usuarios con
 * sesión se sincroniza con el servidor (ver cart-provider). `skipHydration`: la lectura de
 * localStorage se hace tras montar, para que el HTML del servidor y el del navegador coincidan.
 */
export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      add: (line) =>
        set((state) => {
          const id = lineId(line);
          const quantity = line.quantity ?? 1;
          const existing = state.lines.find((item) => item.id === id);
          if (existing) {
            return {
              lines: state.lines.map((item) =>
                item.id === id ? { ...item, quantity: clamp(item.quantity + quantity) } : item,
              ),
            };
          }
          if (state.lines.length >= MAX_CART_LINES) return state;
          return { lines: [...state.lines, { ...line, id, quantity: clamp(quantity) }] };
        }),
      setQuantity: (id, quantity) =>
        set((state) => ({
          lines: state.lines.map((item) =>
            item.id === id ? { ...item, quantity: clamp(quantity) } : item,
          ),
        })),
      remove: (id) => set((state) => ({ lines: state.lines.filter((item) => item.id !== id) })),
      clear: () => set({ lines: [] }),
      replace: (lines) => set({ lines: lines.slice(0, MAX_CART_LINES) }),
    }),
    {
      name: "fornea-cart-v1",
      version: 1,
      skipHydration: true,
      partialize: (state) => ({ lines: state.lines }),
    },
  ),
);

export const cartItemCount = (lines: readonly CartLine[]) =>
  lines.reduce((sum, line) => sum + line.quantity, 0);

/** Cuerpo que se envía al servidor: solo identificadores y cantidades, nunca precios. */
export const toApiItems = (lines: readonly CartLine[]) =>
  lines.map((line) => ({
    productId: line.productId,
    quantity: line.quantity,
    optionIds: line.optionIds,
    ...(line.notes ? { notes: line.notes } : {}),
  }));

interface CartUiState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

/** Estado del panel lateral del carrito (abrirlo desde cualquier sitio, por ejemplo al añadir). */
export const useCartUi = create<CartUiState>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

/** ¿Ya se leyó el carrito guardado en el navegador? Evita mostrar «vacío» un instante al cargar. */
export function useCartHydrated(): boolean {
  return useSyncExternalStore(
    (listener) => useCartStore.persist.onFinishHydration(listener),
    () => useCartStore.persist.hasHydrated(),
    () => false,
  );
}
