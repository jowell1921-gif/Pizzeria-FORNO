import type { PrismaClient } from "../../db/client.js";
import { orderEvents, type OrderEvent } from "../../events/order-events.js";
import { deliverNotification, enqueueOrderEmail } from "../notifications/notification.service.js";
import type { Mailer } from "../notifications/mailer.js";
import type { EmailTemplate } from "../notifications/templates.js";
import type { PaymentGateway } from "../payments/gateway.js";
import { refundPayment } from "../payments/payment.service.js";

export interface OrderEffectsDeps {
  mailer: Mailer;
  /** Pasarela de pago, si está configurada (para devolver el importe de pedidos cancelados). */
  gateway?: PaymentGateway | undefined;
}

/** Qué aviso corresponde a cada cambio. Un pedido a domicilio «listo» espera al repartidor: sin aviso. */
function templateFor(event: OrderEvent, type: "PICKUP" | "DELIVERY"): EmailTemplate | null {
  switch (event.status) {
    case "NEW":
      return "ORDER_CONFIRMED";
    case "ACCEPTED":
      return "ORDER_ACCEPTED";
    case "REJECTED":
      return "ORDER_REJECTED";
    case "READY":
      return type === "PICKUP" ? "ORDER_READY" : null;
    case "OUT_FOR_DELIVERY":
      return "ORDER_OUT_FOR_DELIVERY";
    case "COMPLETED":
      return "ORDER_COMPLETED";
    case "CANCELLED":
      return "ORDER_CANCELLED";
    default:
      return null;
  }
}

/**
 * Consecuencias de un cambio de pedido que NO deben bloquearlo ni hacerlo fallar: avisos por correo y
 * devolución del pago online si el pedido se cancela o se rechaza. Cada una es idempotente y los
 * errores se tragan (quedan registrados en el aviso o en el pago).
 */
export async function handleOrderEvent(
  prisma: PrismaClient,
  deps: OrderEffectsDeps,
  event: OrderEvent,
): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: event.orderId },
      include: { payments: true },
    });
    if (!order) return;

    if (deps.gateway && (event.status === "CANCELLED" || event.status === "REJECTED")) {
      for (const payment of order.payments) {
        if (payment.method === "ONLINE" && payment.status === "PAID") {
          await refundPayment(prisma, deps.gateway, {
            paymentId: payment.id,
            actorId: null,
            reason: `Order ${event.status.toLowerCase()}`,
          }).catch(() => undefined);
        }
      }
    }

    const template = templateFor(event, order.type);
    if (!template) return;
    const id = await enqueueOrderEmail(prisma, order.id, template);
    if (id) await deliverNotification(prisma, deps.mailer, id);
  } catch {
    // Nunca debe afectar al pedido.
  }
}

/** Conecta los efectos al bus de eventos de pedidos. Devuelve la función para desconectarlos. */
export function registerOrderEffects(prisma: PrismaClient, deps: OrderEffectsDeps): () => void {
  return orderEvents.subscribe((event) => {
    void handleOrderEvent(prisma, deps, event);
  });
}
