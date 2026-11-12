"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { AssistantError, type AssistantClient, type ChatMessage } from "./assistant-client";
import { WELCOME_MESSAGE } from "./suggestions";

const WELCOME: ChatMessage = { id: "welcome", role: "assistant", text: WELCOME_MESSAGE };

/**
 * Estado de la conversación. Vive solo en memoria (no se guarda) y no sabe quién genera las
 * respuestas: las pide al `AssistantClient` recibido.
 */
export function useChat(client: AssistantClient) {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [typing, setTyping] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const counter = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const history = useRef<ChatMessage[]>([WELCOME]);

  useEffect(() => () => controller.current?.abort(), []);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || controller.current) return;
      counter.current += 1;
      const userMessage: ChatMessage = { id: `u${counter.current}`, role: "user", text };
      history.current = [...history.current, userMessage];
      setMessages(history.current);
      setTyping(true);
      setFailure(null);

      const abort = new AbortController();
      controller.current = abort;
      try {
        const reply = await client.send(history.current, text, abort.signal);
        counter.current += 1;
        history.current = [
          ...history.current,
          {
            id: `a${counter.current}`,
            role: "assistant",
            text: reply.text,
            provisional: reply.provisional,
            ...(reply.ai ? { ai: true } : {}),
            ...(reply.links ? { links: reply.links } : {}),
          },
        ];
        setMessages(history.current);
      } catch (error) {
        if ((error as { name?: string }).name !== "AbortError") {
          setFailure(
            error instanceof AssistantError
              ? error.userMessage
              : "No he podido responder. Inténtalo de nuevo.",
          );
        }
      } finally {
        if (controller.current === abort) controller.current = null;
        setTyping(false);
      }
    },
    [client],
  );

  return { messages, typing, failure, send };
}
