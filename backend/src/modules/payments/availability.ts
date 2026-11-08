import type { PaymentMethod } from "../../generated/prisma/enums.js";

/**
 * Métodos de pago que se pueden usar de verdad ahora mismo. El pago online necesita un proveedor
 * integrado y con credenciales (Stripe, fase 9): hasta entonces no se ofrece, aunque el local lo
 * tenga activado en su configuración. Nunca se simula un pago.
 */
export function isOnlinePaymentAvailable(): boolean {
  return false;
}

export function usablePaymentMethods(enabled: readonly PaymentMethod[]): PaymentMethod[] {
  return enabled.filter((method) => method !== "ONLINE" || isOnlinePaymentAvailable());
}
