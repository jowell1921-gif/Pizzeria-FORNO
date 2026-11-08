import { ApiError } from "@/lib/api";
import { formatEuro } from "@/lib/format";

/** Mensaje en español para un cupón o recompensa rechazados por el servidor. */
export function discountErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError))
    return "No hemos podido comprobar el descuento. Inténtalo de nuevo.";
  switch (error.code) {
    case "COUPON_NOT_FOUND":
      return "Este código no existe. Revísalo e inténtalo de nuevo.";
    case "COUPON_INACTIVE":
      return "Este código ya no está activo.";
    case "COUPON_EXPIRED":
      return "Este código ha caducado.";
    case "COUPON_NOT_STARTED":
      return "Este código todavía no es válido.";
    case "COUPON_USED_UP":
      return "Este código ya no tiene usos disponibles.";
    case "COUPON_ALREADY_USED":
      return "Ya has usado este código.";
    case "COUPON_NOT_FIRST_ORDER":
      return "Este código solo vale para tu primer pedido.";
    case "COUPON_NOT_APPLICABLE":
      return "Este código no se puede aplicar a los productos de tu pedido.";
    case "COUPON_MIN_SUBTOTAL": {
      const min = (error.details as { minSubtotal?: string } | undefined)?.minSubtotal;
      return min
        ? `Para usar este código el pedido debe ser de al menos ${formatEuro(min)} en productos.`
        : "Tu pedido no alcanza el importe mínimo de este código.";
    }
    case "REDEMPTION_NOT_AVAILABLE":
      return "Esta recompensa ya no está disponible.";
    case "REWARD_NOT_APPLICABLE":
      return error.message.startsWith("Add ")
        ? "Añade el producto de la recompensa a tu pedido para poder usarla."
        : "Esta recompensa no se puede aplicar a tu pedido.";
    case "UNAUTHENTICATED":
      return "Inicia sesión para usar cupones y recompensas.";
    case "NETWORK_ERROR":
      return "No se pudo conectar con el servidor. Inténtalo de nuevo.";
    default:
      return "No hemos podido aplicar el descuento.";
  }
}

/** ¿El error es de un cupón (y no de una recompensa)? */
export const isCouponError = (error: ApiError | null) => error?.code.startsWith("COUPON_") ?? false;
