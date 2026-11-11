import type { PaymentMethod } from "../../generated/prisma/enums.js";

/**
 * Métodos de pago que se pueden usar de verdad ahora mismo. El pago online necesita una pasarela
 * configurada (Stripe con sus claves): sin ella no se ofrece, aunque el local lo tenga activado en su
 * configuración. Nunca se simula un pago.
 */
export function usablePaymentMethods(
  enabled: readonly PaymentMethod[],
  onlineAvailable: boolean,
): PaymentMethod[] {
  return enabled.filter((method) => method !== "ONLINE" || onlineAvailable);
}
