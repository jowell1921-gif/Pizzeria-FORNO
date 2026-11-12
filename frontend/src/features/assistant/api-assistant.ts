import { z } from "zod";

import { ApiError, apiRequest } from "@/lib/api";

import { AssistantError, type AssistantClient, type ChatMessage } from "./assistant-client";

const answerSchema = z.object({
  text: z.string(),
  links: z.array(z.object({ label: z.string(), href: z.string() })),
});

const statusSchema = z.object({ available: z.boolean() });

/** ¿Tiene el servidor una IA configurada? Si no (o si falla la consulta), PizzAI usa el modo de demostración. */
export async function fetchAssistantStatus(): Promise<boolean> {
  try {
    return (await apiRequest("/assistant/status", { schema: statusSchema })).available;
  } catch {
    return false;
  }
}

/** Texto para el cliente según el error del servidor; nunca se muestra el mensaje técnico. */
function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "ASSISTANT_LIMIT_REACHED":
        return "PizzAI ha alcanzado su límite de hoy. Vuelve mañana o consulta la carta y las promociones.";
      case "RATE_LIMITED":
        return "Estás escribiendo muy rápido. Espera unos minutos e inténtalo de nuevo.";
      case "ASSISTANT_BUSY":
        return "PizzAI está muy ocupado ahora mismo. Inténtalo en un momento.";
      case "NETWORK_ERROR":
        return "No se pudo conectar con el servidor. Comprueba tu conexión.";
      default:
        return "No he podido responder. Inténtalo de nuevo.";
    }
  }
  return "No he podido responder. Inténtalo de nuevo.";
}

/**
 * Cliente de la IA real: manda la conversación al backend, que es quien habla con el proveedor
 * (la clave nunca llega al navegador) y quien decide qué datos del negocio puede ver la IA.
 */
export function createApiAssistant(): AssistantClient {
  return {
    async send(history: readonly ChatMessage[], _text: string, signal?: AbortSignal) {
      const turns = history.map((message) => ({
        role: message.role,
        content: message.text,
      }));
      // La conversación debe empezar por el usuario: se quita el saludo inicial de PizzAI.
      const firstUser = turns.findIndex((turn) => turn.role === "user");
      const messages = turns.slice(Math.max(firstUser, 0)).slice(-12);
      try {
        const answer = await apiRequest("/assistant/chat", {
          method: "POST",
          body: { messages },
          schema: answerSchema,
          ...(signal ? { signal } : {}),
        });
        return { ...answer, provisional: false, ai: true };
      } catch (error) {
        if ((error as { name?: string }).name === "AbortError") throw error;
        throw new AssistantError(messageFor(error));
      }
    },
  };
}
