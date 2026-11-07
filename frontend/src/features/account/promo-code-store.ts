import { useSyncExternalStore } from "react";

const KEY = "forno-promo-code";
const listeners = new Set<() => void>();

/** Formato admitido de un código promocional (el servidor decide después si es válido). */
export const PROMO_CODE_PATTERN = /^[A-Z0-9_-]{3,24}$/;

export function normalizePromoCode(value: string): string {
  return value.trim().toUpperCase();
}

function read(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** Código promocional guardado en este navegador, a la espera de aplicarse en el pedido. */
export function useSavedPromoCode(): string | null {
  return useSyncExternalStore(subscribe, read, () => null);
}

export function savePromoCode(code: string) {
  try {
    window.localStorage.setItem(KEY, code);
  } catch {
    return;
  }
  listeners.forEach((listener) => listener());
}

export function clearPromoCode() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    return;
  }
  listeners.forEach((listener) => listener());
}
