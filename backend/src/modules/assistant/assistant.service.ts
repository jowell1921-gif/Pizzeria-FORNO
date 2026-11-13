import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { HttpError } from "../../errors.js";
import type { AssistantModel } from "./model.js";
import { SYSTEM_PROMPT } from "./prompt.js";

/**
 * Entrada del chat. Solo mensajes de usuario y asistente (nunca «system»: las instrucciones las pone
 * el servidor), con límites de número y longitud para acotar el coste y el abuso.
 */
export const MAX_MESSAGES = 12;
export const MAX_MESSAGE_CHARS = 500;
const MAX_TOTAL_CHARS = 4000;
const MAX_REPLY_CHARS = 1500;

export const chatRequestSchema = z
  .object({
    messages: z
      .array(
        z
          .object({
            role: z.enum(["user", "assistant"]),
            content: z.string().trim().min(1).max(MAX_MESSAGE_CHARS),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_MESSAGES),
  })
  .strict()
  .refine((value) => value.messages.at(-1)?.role === "user", {
    message: "The last message must come from the user",
    path: ["messages"],
  })
  .refine(
    (value) => value.messages.reduce((sum, m) => sum + m.content.length, 0) <= MAX_TOTAL_CHARS,
    {
      message: "The conversation is too long",
      path: ["messages"],
    },
  );

export interface AssistantLink {
  label: string;
  href: string;
}

export interface AssistantAnswer {
  text: string;
  links: AssistantLink[];
}

export interface AssistantServiceDeps {
  model: AssistantModel;
  /** Datos públicos del negocio en texto (ver knowledge.ts). */
  knowledge: () => Promise<string>;
  /** Máximo de mensajes al modelo por día (todos los visitantes juntos): tope de gasto. */
  dailyLimit: number;
  now?: () => Date;
  /** Para registrar el consumo (solo cifras, nunca el contenido de la conversación). */
  onUsage?: (usage: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
  }) => void;
}

const REFUSAL_TEXT =
  "Con eso no puedo ayudarte. Puedo contarte qué hay en la carta, las promociones, el reparto o FORNEA CLUB.";
const EMPTY_TEXT =
  "No he sabido responder a eso. Prueba a preguntarme por la carta, las promociones, el reparto o FORNEA CLUB.";

/** Enlaces útiles según de qué trata la respuesta (los decide el servidor, no el modelo). */
export function linksFor(question: string, answer: string): AssistantLink[] {
  const text = `${question} ${answer}`.toLowerCase();
  const links: AssistantLink[] = [];
  if (/promoci|oferta|cup[oó]n|descuento|combo/.test(text)) {
    links.push({ label: "Ver promociones", href: "/promociones" });
  }
  if (/fornea club|puntos|recompensa/.test(text)) {
    links.push({ label: "Conocer FORNEA CLUB", href: "/fornea-club" });
  }
  if (links.length < 2 && /carta|pizza|entrante|bebida|postre|pedir|reparto|domicilio/.test(text)) {
    links.push({ label: "Ver la carta", href: "/carta" });
  }
  return links.slice(0, 2);
}

/**
 * Servicio de PizzAI: valida la conversación, aplica el tope diario, construye los datos públicos
 * del negocio y llama al modelo. Nunca recibe datos de clientes.
 */
export function createAssistantService(deps: AssistantServiceDeps) {
  const now = deps.now ?? (() => new Date());
  let day = "";
  let used = 0;

  /** Reserva un mensaje del cupo diario (UTC). Si no queda, lanza 429. */
  function reserve() {
    const today = now().toISOString().slice(0, 10);
    if (today !== day) {
      day = today;
      used = 0;
    }
    if (used >= deps.dailyLimit) {
      throw new HttpError(
        429,
        "ASSISTANT_LIMIT_REACHED",
        "The assistant reached its daily limit; try again tomorrow",
      );
    }
    used += 1;
  }

  return {
    model: deps.model.name,

    async chat(body: unknown, signal?: AbortSignal): Promise<AssistantAnswer> {
      const { messages } = chatRequestSchema.parse(body);
      reserve();

      let result;
      try {
        result = await deps.model.complete({
          system: { instructions: SYSTEM_PROMPT, knowledge: await deps.knowledge() },
          messages,
          ...(signal ? { signal } : {}),
        });
      } catch (error) {
        if (error instanceof HttpError) throw error;
        // Sin detalles del proveedor hacia el cliente.
        if (
          error instanceof Anthropic.RateLimitError ||
          (error instanceof Anthropic.APIError && (error.status === 529 || error.status === 503))
        ) {
          throw new HttpError(
            503,
            "ASSISTANT_BUSY",
            "The assistant is busy; try again in a moment",
          );
        }
        throw new HttpError(502, "ASSISTANT_ERROR", "The assistant could not answer");
      }

      deps.onUsage?.({ model: deps.model.name, ...result.usage });
      const question = messages.at(-1)?.content ?? "";
      if (result.refused) return { text: REFUSAL_TEXT, links: [] };
      const text =
        result.text.length > MAX_REPLY_CHARS
          ? `${result.text.slice(0, MAX_REPLY_CHARS)}…`
          : result.text;
      if (!text) return { text: EMPTY_TEXT, links: [] };
      return { text, links: linksFor(question, text) };
    },
  };
}

export type AssistantService = ReturnType<typeof createAssistantService>;
