import { Prisma, type PrismaClient } from "../../db/client.js";
import type { Mailer } from "./mailer.js";
import { renderOrderEmail, type EmailTemplate } from "./templates.js";

/** Intentos y esperas entre ellos (minutos). Tras el último, el aviso queda como fallido. */
const BACKOFF_MINUTES = [1, 5, 15, 60, 240] as const;
const MAX_ATTEMPTS = BACKOFF_MINUTES.length;
/** Mientras un proceso envía un aviso, se «reserva» este tiempo para que otro no lo envíe a la vez. */
const CLAIM_MINUTES = 2;

/**
 * Deja constancia de un aviso para el cliente del pedido. Es idempotente: solo existe un aviso por
 * pedido, plantilla y destinatario (índice único), así que un evento repetido no duplica correos.
 * Nunca lanza: un fallo aquí no debe afectar al pedido.
 */
export async function enqueueOrderEmail(
  prisma: PrismaClient,
  orderId: string,
  template: EmailTemplate,
): Promise<string | null> {
  try {
    const [order, settings] = await Promise.all([
      prisma.order.findUnique({ where: { id: orderId } }),
      prisma.storeSettings.findUnique({ where: { id: 1 } }),
    ]);
    if (!order || !settings) return null;

    const rendered = renderOrderEmail(template, {
      orderNumber: order.orderNumber,
      type: order.type,
      customerName: order.customerName,
      total: order.total.toFixed(2),
      scheduledFor: order.scheduledFor,
      estimatedReadyAt: order.estimatedReadyAt,
      cancellationReason: order.cancellationReason,
      timezone: settings.timezone,
      storeName: settings.name,
      storePhone: settings.phone,
      storeAddress: `${settings.addressLine}, ${settings.postalCode} ${settings.city}`,
    });
    const log = await prisma.notificationLog.create({
      data: {
        orderId: order.id,
        userId: order.userId,
        template,
        recipient: order.customerEmail,
        subject: rendered.subject,
        bodyText: rendered.text,
        bodyHtml: rendered.html,
        nextAttemptAt: new Date(),
      },
    });
    return log.id;
  } catch (error) {
    // Ya existía (índice único): nada que hacer. Otro fallo: se ignora para no afectar al pedido.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      return null;
    return null;
  }
}

/** Intenta enviar un aviso concreto. Devuelve su estado final, o null si otro proceso lo tiene. */
export async function deliverNotification(
  prisma: PrismaClient,
  mailer: Mailer,
  id: string,
  now = new Date(),
) {
  // Reserva atómica: solo un proceso envía cada aviso.
  const claimed = await prisma.notificationLog.updateMany({
    where: {
      id,
      status: "PENDING",
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    data: { nextAttemptAt: new Date(now.getTime() + CLAIM_MINUTES * 60_000) },
  });
  if (claimed.count === 0) return null;

  const log = await prisma.notificationLog.findUniqueOrThrow({ where: { id } });
  try {
    const result = await mailer.send({
      to: log.recipient,
      subject: log.subject ?? "",
      text: log.bodyText ?? "",
      html: log.bodyHtml ?? "",
    });
    return prisma.notificationLog.update({
      where: { id },
      data: {
        status: result === "sent" ? "SENT" : "LOGGED",
        attempts: { increment: 1 },
        sentAt: result === "sent" ? now : null,
        nextAttemptAt: null,
        lastError: null,
      },
    });
  } catch (error) {
    const attempts = log.attempts + 1;
    const exhausted = attempts >= MAX_ATTEMPTS;
    const wait = BACKOFF_MINUTES[Math.min(attempts - 1, MAX_ATTEMPTS - 1)]!;
    return prisma.notificationLog.update({
      where: { id },
      data: {
        status: exhausted ? "FAILED" : "PENDING",
        attempts,
        lastError: (error instanceof Error ? error.message : "Unknown error").slice(0, 300),
        nextAttemptAt: exhausted ? null : new Date(now.getTime() + wait * 60_000),
      },
    });
  }
}

/** Envía los avisos pendientes cuyo turno ha llegado (reintentos incluidos). */
export async function processPendingNotifications(
  prisma: PrismaClient,
  mailer: Mailer,
  now = new Date(),
  limit = 20,
) {
  const due = await prisma.notificationLog.findMany({
    where: {
      status: "PENDING",
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });
  let handled = 0;
  for (const { id } of due) {
    if (await deliverNotification(prisma, mailer, id, now)) handled += 1;
  }
  return handled;
}

/** Proceso periódico que reintenta los avisos pendientes. Devuelve la función para pararlo. */
export function startNotificationWorker(
  prisma: PrismaClient,
  mailer: Mailer,
  intervalMs = 30_000,
): () => void {
  const timer = setInterval(() => {
    // Un fallo puntual (por ejemplo, la base de datos reiniciándose) no debe parar el proceso, pero sí
    // quedar en el registro. Solo el mensaje: nunca el contenido de los correos.
    processPendingNotifications(prisma, mailer).catch((error: unknown) =>
      console.error(`[notifications] ${error instanceof Error ? error.message : "unknown error"}`),
    );
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
