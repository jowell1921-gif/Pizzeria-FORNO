export interface OrderStreamEvent {
  kind: "created" | "status";
  orderId: string;
  orderNumber: number;
  status: string;
}

/**
 * Separa un flujo SSE en mensajes. Un mensaje termina con una línea en blanco; las líneas que
 * empiezan por «:» son comentarios (latidos) y se ignoran.
 */
export function parseSseChunk(buffer: string): {
  events: Array<{ event: string; data: string }>;
  rest: string;
} {
  const events: Array<{ event: string; data: string }> = [];
  const parts = buffer.split(/\r?\n\r?\n/);
  const rest = parts.pop() ?? "";
  for (const part of parts) {
    let event = "message";
    const data: string[] = [];
    for (const line of part.split(/\r?\n/)) {
      if (line.startsWith(":") || line === "") continue;
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).trim());
    }
    if (data.length > 0) events.push({ event, data: data.join("\n") });
  }
  return { events, rest };
}

interface StreamOptions {
  url: string;
  /** Devuelve el token actual; se vuelve a pedir en cada reconexión (así se renueva). */
  getToken: () => string | null;
  onEvent: (event: OrderStreamEvent) => void;
  onStatus: (connected: boolean) => void;
  signal: AbortSignal;
}

const BASE_DELAY = 2_000;
const MAX_DELAY = 30_000;

/**
 * Conecta con el flujo de eventos del servidor usando `fetch` (y no `EventSource`) para poder
 * enviar la cabecera `Authorization` sin poner el token en la URL. Si se corta, reintenta con
 * espera creciente. Termina cuando se cancela la señal.
 */
export async function connectOrderStream(options: StreamOptions): Promise<void> {
  let delay = BASE_DELAY;
  while (!options.signal.aborted) {
    const token = options.getToken();
    if (token) {
      try {
        const response = await fetch(options.url, {
          headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
          signal: options.signal,
          cache: "no-store",
        });
        if (response.ok && response.body) {
          options.onStatus(true);
          delay = BASE_DELAY;
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const parsed = parseSseChunk(buffer);
            buffer = parsed.rest;
            for (const message of parsed.events) {
              if (message.event !== "order") continue;
              try {
                options.onEvent(JSON.parse(message.data) as OrderStreamEvent);
              } catch {
                // Mensaje mal formado: se ignora.
              }
            }
          }
        }
      } catch {
        // Corte de red o cancelación: se decide abajo si hay que reintentar.
      }
    }
    options.onStatus(false);
    if (options.signal.aborted) return;
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(delay * 2, MAX_DELAY);
  }
}
