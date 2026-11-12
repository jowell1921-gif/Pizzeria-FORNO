import Anthropic from "@anthropic-ai/sdk";

/** Un mensaje de la conversación (solo usuario y asistente; el sistema lo pone el servidor). */
export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ModelRequest {
  /** Instrucciones y datos del negocio, ya redactados por el servidor. */
  system: { instructions: string; knowledge: string };
  messages: ChatTurn[];
  signal?: AbortSignal;
}

export interface ModelResult {
  text: string;
  /** El proveedor declinó responder (clasificadores de seguridad). */
  refused: boolean;
  usage: { inputTokens: number; outputTokens: number; cachedTokens: number };
}

/**
 * El modelo de IA, detrás de una interfaz: la lógica del asistente no depende del proveedor y las
 * pruebas usan uno falso. Hoy hay una implementación (Claude, de Anthropic).
 */
export interface AssistantModel {
  readonly name: string;
  complete(request: ModelRequest): Promise<ModelResult>;
}

/** Subconjunto del cliente del SDK que usamos (permite inyectar uno falso en las pruebas). */
export interface MessagesClient {
  beta: {
    messages: {
      create(
        params: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming,
        options?: { signal?: AbortSignal; timeout?: number },
      ): PromiseLike<Anthropic.Beta.Messages.BetaMessage>;
    };
  };
}

/** Margen para el razonamiento interno del modelo (cuenta dentro de `max_tokens`) y la respuesta. */
const MAX_TOKENS = 2000;
const TIMEOUT_MS = 30_000;

export function createAnthropicModel(options: {
  apiKey: string;
  model: string;
  client?: MessagesClient;
}): AssistantModel {
  const client: MessagesClient =
    options.client ?? (new Anthropic({ apiKey: options.apiKey, maxRetries: 1 }) as MessagesClient);

  return {
    name: options.model,
    async complete(request) {
      const response = await client.beta.messages.create(
        {
          model: options.model,
          max_tokens: MAX_TOKENS,
          // Si los clasificadores de seguridad declinan, la API reintenta sola con otro modelo.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          // Charla sencilla sobre una carta: poco razonamiento basta y reduce coste y latencia.
          output_config: { effort: "low" },
          system: [
            { type: "text", text: request.system.instructions },
            // Instrucciones + datos forman el prefijo estable: se cachea entre mensajes.
            {
              type: "text",
              text: request.system.knowledge,
              cache_control: { type: "ephemeral" },
            },
          ],
          messages: request.messages.map((turn) => ({ role: turn.role, content: turn.content })),
        },
        {
          timeout: TIMEOUT_MS,
          ...(request.signal ? { signal: request.signal } : {}),
        },
      );

      const text = response.content
        .filter((block): block is Anthropic.Beta.Messages.BetaTextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();
      return {
        text,
        refused: response.stop_reason === "refusal",
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          cachedTokens: response.usage.cache_read_input_tokens ?? 0,
        },
      };
    },
  };
}
