/**
 * Contrato entre la interfaz de PizzAI y quien genera las respuestas. La interfaz solo conoce esta
 * forma: para conectar una IA real basta con ofrecer otro `AssistantClient` (por ejemplo, uno que
 * llame al backend) sin tocar los componentes.
 */
export interface AssistantLink {
  label: string;
  href: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Enlaces útiles que acompañan a la respuesta. */
  links?: AssistantLink[];
  /** Respuesta de demostración, no generada por una IA. Se muestra siempre como provisional. */
  provisional?: boolean;
  /** Respuesta generada por una IA (se avisa al usuario de que puede contener errores). */
  ai?: boolean;
}

export interface AssistantReply {
  text: string;
  links?: AssistantLink[];
  provisional: boolean;
  ai?: boolean;
}

/** Error del asistente con un texto ya pensado para mostrar al cliente. */
export class AssistantError extends Error {
  constructor(readonly userMessage: string) {
    super(userMessage);
    this.name = "AssistantError";
  }
}

/** Cómo responde PizzAI en este momento: con IA real o en modo de demostración. */
export type AssistantMode = "demo" | "ai";

export interface AssistantClient {
  /** Devuelve la respuesta a `text`, teniendo en cuenta la conversación previa. */
  send(
    history: readonly ChatMessage[],
    text: string,
    signal?: AbortSignal,
  ): Promise<AssistantReply>;
}
