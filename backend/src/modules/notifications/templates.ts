import { escapeHtml } from "../../utils/html.js";

/** Avisos de pedido por correo. Son transaccionales: no llevan contenido comercial. */
export const EMAIL_TEMPLATES = [
  "ORDER_CONFIRMED",
  "ORDER_ACCEPTED",
  "ORDER_REJECTED",
  "ORDER_READY",
  "ORDER_OUT_FOR_DELIVERY",
  "ORDER_COMPLETED",
  "ORDER_CANCELLED",
] as const;

export type EmailTemplate = (typeof EMAIL_TEMPLATES)[number];

export interface EmailOrder {
  orderNumber: number;
  type: "PICKUP" | "DELIVERY";
  customerName: string;
  total: string;
  scheduledFor: Date | null;
  estimatedReadyAt: Date | null;
  cancellationReason: string | null;
  timezone: string;
  storeName: string;
  storePhone: string;
  storeAddress: string;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const time = (date: Date, timezone: string) =>
  new Intl.DateTimeFormat("es-ES", {
    timeZone: timezone,
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);

function body(template: EmailTemplate, order: EmailOrder): { subject: string; lines: string[] } {
  const number = `#${order.orderNumber}`;
  const when = order.scheduledFor ?? order.estimatedReadyAt;
  const whenText = when ? ` Hora prevista: ${time(when, order.timezone)}.` : "";
  const place =
    order.type === "PICKUP"
      ? `Puedes recogerlo en ${order.storeAddress}.`
      : "Te lo llevaremos a la dirección indicada.";

  switch (template) {
    case "ORDER_CONFIRMED":
      return {
        subject: `Hemos recibido tu pedido ${number}`,
        lines: [
          `Hola ${order.customerName}, hemos recibido tu pedido ${number} por ${order.total} €.`,
          `${place}${whenText}`,
          "Te avisaremos cuando el local lo acepte.",
        ],
      };
    case "ORDER_ACCEPTED":
      return {
        subject: `Tu pedido ${number} ha sido aceptado`,
        lines: [`Hola ${order.customerName}, el local ha aceptado tu pedido ${number}.${whenText}`],
      };
    case "ORDER_REJECTED":
      return {
        subject: `No hemos podido aceptar tu pedido ${number}`,
        lines: [
          `Hola ${order.customerName}, lamentamos informarte de que no hemos podido aceptar tu pedido ${number}.`,
          order.cancellationReason ? `Motivo: ${order.cancellationReason}.` : "",
          `Si ya habías pagado online, te devolveremos el importe. Para cualquier duda, llámanos al ${order.storePhone}.`,
        ],
      };
    case "ORDER_READY":
      return {
        subject: `Tu pedido ${number} está listo para recoger`,
        lines: [
          `Hola ${order.customerName}, tu pedido ${number} ya está listo.`,
          `Te esperamos en ${order.storeAddress}.`,
        ],
      };
    case "ORDER_OUT_FOR_DELIVERY":
      return {
        subject: `Tu pedido ${number} va de camino`,
        lines: [`Hola ${order.customerName}, tu pedido ${number} ha salido a reparto.`],
      };
    case "ORDER_COMPLETED":
      return {
        subject: `Pedido ${number} completado`,
        lines: [
          `Hola ${order.customerName}, tu pedido ${number} está completado. ¡Gracias por pedir en ${order.storeName}!`,
          "Puedes descargar tu ticket desde «Mi cuenta».",
        ],
      };
    case "ORDER_CANCELLED":
      return {
        subject: `Tu pedido ${number} ha sido cancelado`,
        lines: [
          `Hola ${order.customerName}, tu pedido ${number} ha sido cancelado.`,
          order.cancellationReason ? `Motivo: ${order.cancellationReason}.` : "",
          "Si ya habías pagado online, te devolveremos el importe.",
        ],
      };
  }
}

/** Redacta el correo en texto y en HTML. Todo dato variable se escapa en el HTML. */
export function renderOrderEmail(template: EmailTemplate, order: EmailOrder): RenderedEmail {
  const { subject, lines } = body(template, order);
  const paragraphs = lines.filter(Boolean);
  const text = [...paragraphs, "", `${order.storeName} · ${order.storePhone}`].join("\n");
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f5e6c8;font-family:Arial,sans-serif;color:#171717"><div style="max-width:520px;margin:0 auto;padding:24px"><div style="background:#171717;color:#f5e6c8;padding:16px 24px;border-radius:12px 12px 0 0;font-size:22px;font-weight:bold">${escapeHtml(order.storeName)}</div><div style="background:#fff;padding:24px;border-radius:0 0 12px 12px;line-height:1.5">${paragraphs
    .map((line) => `<p style="margin:0 0 12px">${escapeHtml(line)}</p>`)
    .join(
      "",
    )}<p style="margin:16px 0 0;font-size:12px;color:#666">${escapeHtml(order.storeName)} · ${escapeHtml(order.storePhone)}<br>Sitio de demostración.</p></div></div></body></html>`;
  return { subject, text, html };
}
