import type { RequestHandler } from "express";

import { orderEvents } from "../events/order-events.js";

const HEARTBEAT_MS = 25_000;
/** Se cierra el flujo pasado este tiempo: el cliente reconecta con un token renovado. */
const MAX_LIFETIME_MS = 15 * 60_000;

/**
 * Flujo de eventos del servidor (SSE) con los cambios de pedidos. Se usa con `fetch` (y no con
 * `EventSource`) para poder enviar la cabecera `Authorization` sin poner el token en la URL.
 *
 * Solo viajan identificadores y estados. Cada 25 s se envía un comentario para mantener viva la
 * conexión, y a los 15 minutos se cierra: así una sesión revocada no sigue recibiendo avisos.
 */
export function orderEventStream(): RequestHandler {
  return (req, res) => {
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    // Evita que un proxy (nginx, Railway) acumule la respuesta en lugar de enviarla al momento.
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    res.write("retry: 5000\n\n");

    const unsubscribe = orderEvents.subscribe((event) => {
      res.write(`event: order\ndata: ${JSON.stringify(event)}\n\n`);
    });
    const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);
    const lifetime = setTimeout(() => res.end(), MAX_LIFETIME_MS);

    const close = () => {
      clearInterval(heartbeat);
      clearTimeout(lifetime);
      unsubscribe();
    };
    req.on("close", close);
    res.on("close", close);
  };
}
