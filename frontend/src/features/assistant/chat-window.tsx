"use client";

import { Send, X } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";

import { Button } from "@/components/ui/button";

import type { AssistantClient } from "./assistant-client";
import { ChatBubble } from "./chat-message";
import { PizzaiCharacter } from "./pizzai-character";
import { SUGGESTIONS } from "./suggestions";
import { TypingIndicator } from "./typing-indicator";
import { useChat } from "./use-chat";

interface ChatWindowProps {
  client: AssistantClient;
  onClose: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
}

/** Ventana de conversación con PizzAI: cabecera, mensajes, sugerencias y campo de texto. */
export function ChatWindow({ client, onClose, inputRef }: ChatWindowProps) {
  const { messages, typing, failed, send } = useChat(client);
  const [draft, setDraft] = useState("");
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages, typing]);

  function submit(text: string) {
    if (!text.trim() || typing) return;
    setDraft("");
    void send(text);
  }

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-label="Chat con PizzAI"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      className="bg-background border-border pizzai-pop fixed inset-x-2 bottom-2 z-40 flex h-[min(34rem,calc(100dvh-1rem))] flex-col overflow-hidden rounded-2xl border shadow-2xl sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[24rem]"
    >
      <header className="bg-charcoal text-cream flex items-center gap-3 px-4 py-3">
        <PizzaiCharacter mood={typing ? "typing" : "happy"} className="size-11 shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-2xl leading-none font-extrabold normal-case">PizzAI</h2>
          <p className="text-cream/80 text-xs">Modo demostración · respuestas provisionales</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Cerrar el chat"
          onClick={onClose}
          className="border-cream/40 text-cream hover:bg-cream/10 hover:text-cream size-11 bg-transparent"
        >
          <X aria-hidden className="size-5" />
        </Button>
      </header>

      <div
        ref={log}
        role="log"
        aria-live="polite"
        aria-label="Conversación"
        className="bg-cream-soft flex-1 space-y-3 overflow-y-auto p-4"
      >
        <ul className="space-y-3">
          {messages.map((message) => (
            <ChatBubble key={message.id} message={message} onNavigate={onClose} />
          ))}
        </ul>
        {messages.length === 1 ? (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Preguntas sugeridas">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => submit(suggestion)}
                className="border-foreground/40 hover:bg-cream min-h-11 rounded-full border bg-white px-4 text-sm font-semibold"
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}
        {typing ? <TypingIndicator /> : null}
        {failed ? (
          <p role="alert" className="text-destructive text-sm font-medium">
            No he podido responder. Inténtalo de nuevo.
          </p>
        ) : null}
      </div>

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit(draft);
        }}
        className="border-border bg-background border-t p-3"
      >
        <div className="flex gap-2">
          <label htmlFor="pizzai-input" className="sr-only">
            Escribe tu pregunta
          </label>
          <input
            id="pizzai-input"
            ref={inputRef}
            value={draft}
            maxLength={300}
            autoComplete="off"
            placeholder="Escribe tu pregunta…"
            onChange={(event) => setDraft(event.target.value)}
            className="border-border bg-background h-11 min-w-0 flex-1 rounded-lg border px-3 text-base"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!draft.trim() || typing}
            aria-label="Enviar mensaje"
            className="size-11"
          >
            <Send aria-hidden className="size-5" />
          </Button>
        </div>
        <p className="text-muted-foreground mt-2 text-xs">
          PizzAI aún no usa inteligencia artificial: las respuestas son de demostración.
        </p>
      </form>
    </section>
  );
}
