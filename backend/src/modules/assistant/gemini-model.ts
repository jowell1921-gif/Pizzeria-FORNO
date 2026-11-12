import type { AssistantModel } from "./model.js";

/** Subconjunto de `fetch` que usamos (permite inyectar uno falso en las pruebas). */
export type FetchLike = (
  url: string,
  init: { method: "POST"; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

interface GeminiResponse {
  candidates?: {
    finishReason?: string;
    content?: { parts?: { text?: string; thought?: boolean }[] };
  }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    cachedContentTokenCount?: number;
  };
}

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_OUTPUT_TOKENS = 2000;
/** Tiempo máximo por intento: el nivel gratuito a veces tarda decenas de segundos. */
const ATTEMPT_TIMEOUT_MS = 12_000;
const RETRY_DELAY_MS = 800;
/** Respuestas tras las que se prueba otro intento: saturación, límite momentáneo o modelo retirado. */
const FALLBACK_STATUS = new Set([404, 429, 500, 503]);
const BLOCKED_FINISH_REASONS = new Set(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII"]);

/**
 * PizzAI con Gemini (Google). Tiene nivel gratuito, por lo que sirve para la demostración. Se usa la
 * API REST directamente: es una sola llamada y así no se añade ninguna dependencia.
 */
export function createGeminiModel(options: {
  apiKey: string;
  model: string;
  fetch?: FetchLike;
}): AssistantModel {
  const doFetch: FetchLike = options.fetch ?? ((url, init) => fetch(url, init));

  // Varios modelos separados por comas: si uno está saturado, no existe o tarda demasiado, se prueba
  // el siguiente. Con un solo modelo se reintenta una vez sobre el mismo.
  const listed = options.model
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  const models = listed.length === 1 ? [listed[0]!, listed[0]!] : listed;

  return {
    name: listed[0] ?? options.model,
    async complete(request) {
      const payload = JSON.stringify({
        systemInstruction: {
          parts: [{ text: request.system.instructions }, { text: request.system.knowledge }],
        },
        contents: request.messages.map((turn) => ({
          role: turn.role === "assistant" ? "model" : "user",
          parts: [{ text: turn.content }],
        })),
        generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS, temperature: 0.4 },
      });

      let response: Awaited<ReturnType<FetchLike>> | undefined;
      let failure: unknown;
      for (const [index, model] of models.entries()) {
        if (index > 0 && listed.length === 1) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        }
        const timeout = AbortSignal.timeout(ATTEMPT_TIMEOUT_MS);
        const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout;
        try {
          const attempt = await doFetch(
            `${ENDPOINT}/${encodeURIComponent(model)}:generateContent`,
            {
              method: "POST",
              // La clave va en una cabecera, no en la URL, para que no acabe en registros.
              headers: { "content-type": "application/json", "x-goog-api-key": options.apiKey },
              signal,
              body: payload,
            },
          );
          response = attempt;
          if (!FALLBACK_STATUS.has(attempt.status)) break;
        } catch (error) {
          // El cliente cerró la conexión: no tiene sentido seguir. Un tiempo agotado, sí.
          if (request.signal?.aborted) throw error;
          failure = error;
          response = undefined;
        }
      }
      if (!response) throw failure instanceof Error ? failure : new Error("Gemini did not answer");
      if (!response.ok) throw new Error(`Gemini responded with HTTP ${response.status}`);

      const body = (await response.json()) as GeminiResponse;
      const candidate = body.candidates?.[0];
      const text = (candidate?.content?.parts ?? [])
        .filter((part) => !part.thought && typeof part.text === "string")
        .map((part) => part.text)
        .join("")
        .trim();
      return {
        text,
        refused:
          Boolean(body.promptFeedback?.blockReason) ||
          BLOCKED_FINISH_REASONS.has(candidate?.finishReason ?? ""),
        usage: {
          inputTokens: body.usageMetadata?.promptTokenCount ?? 0,
          outputTokens: body.usageMetadata?.candidatesTokenCount ?? 0,
          cachedTokens: body.usageMetadata?.cachedContentTokenCount ?? 0,
        },
      };
    },
  };
}
