import type { PrismaClient } from "../../db/client.js";
import { HttpError } from "../../errors.js";
import { changeOrderStatus } from "./status.service.js";

/**
 * Tareas de mantenimiento periódicas. Corren en el propio proceso de la API (una sola réplica, ver
 * docs/decisions/0009): si algún día hay varias, hay que moverlas a un trabajo programado para que
 * no se ejecuten a la vez. Ambas tareas son idempotentes, así que repetirlas no hace daño.
 */

/**
 * Minutos tras los que un pedido online sin cobrar se da por abandonado. Es mayor que la vida de la
 * sesión de pago (30 min): si Stripe la cierra, su evento cancela el pedido antes; esto cubre el caso
 * en que nunca llegó a abrirse la sesión.
 */
export const ABANDONED_PAYMENT_MINUTES = 45;

/**
 * Cancela los pedidos online que siguen «pendientes de pago» pasado `ABANDONED_PAYMENT_MINUTES`.
 *
 * Por qué importa: un pedido pendiente mantiene reservados el cupón, la recompensa canjeada y los
 * puntos gastados. Si el cliente cierra la web antes de abrir la pasarela, no llega ningún evento de
 * Stripe que lo cancele y esos recursos quedarían bloqueados para siempre. Al cancelar se liberan.
 *
 * Devuelve cuántos pedidos canceló. Si un pago se cobrara justo después, el flujo de «pago tardío»
 * de los webhooks lo devuelve automáticamente.
 */
export async function cancelAbandonedPaymentOrders(
  prisma: PrismaClient,
  now = new Date(),
  limit = 50,
): Promise<number> {
  const cutoff = new Date(now.getTime() - ABANDONED_PAYMENT_MINUTES * 60_000);
  const abandoned = await prisma.order.findMany({
    where: {
      status: "PENDING_PAYMENT",
      // Se mira la última actividad del pago, no la creación del pedido: «Pagar ahora» abre una sesión
      // nueva y vuelve a dar a la pasarela su plazo completo.
      payments: { some: { method: "ONLINE", status: "PENDING", updatedAt: { lt: cutoff } } },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });

  let cancelled = 0;
  for (const { id } of abandoned) {
    try {
      await changeOrderStatus(prisma, {
        orderId: id,
        to: "CANCELLED",
        actorId: null,
        reason: "Pago no completado",
      });
      await prisma.payment.updateMany({
        where: { orderId: id, method: "ONLINE", status: "PENDING" },
        data: { status: "FAILED", failureReason: "ABANDONED" },
      });
      cancelled += 1;
    } catch (error) {
      // Otro proceso lo movió a la vez (por ejemplo, un pago que acaba de confirmarse): no es un error.
      if (!(error instanceof HttpError) || error.code !== "INVALID_TRANSITION") throw error;
    }
  }
  return cancelled;
}

/**
 * Borra las claves de idempotencia caducadas. Solo sirven para reconocer reintentos de una petición;
 * pasado su plazo no aportan nada y la tabla crecería sin límite.
 */
export async function purgeExpiredIdempotencyRecords(
  prisma: PrismaClient,
  now = new Date(),
): Promise<number> {
  const { count } = await prisma.idempotencyRecord.deleteMany({
    where: { expiresAt: { lt: now } },
  });
  return count;
}

/** Arranca el mantenimiento periódico. Devuelve la función para pararlo (cierre ordenado). */
export function startMaintenanceWorker(
  prisma: PrismaClient,
  intervalMs = 5 * 60_000,
  log: (message: string) => void = (message) => console.error(message),
): () => void {
  const run = () => {
    Promise.all([
      cancelAbandonedPaymentOrders(prisma),
      purgeExpiredIdempotencyRecords(prisma),
    ]).catch(
      // Solo el mensaje: un fallo de mantenimiento no debe tumbar la API ni volcar datos en el registro.
      (error: unknown) =>
        log(`[maintenance] ${error instanceof Error ? error.message : "unknown error"}`),
    );
  };
  const timer = setInterval(run, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
