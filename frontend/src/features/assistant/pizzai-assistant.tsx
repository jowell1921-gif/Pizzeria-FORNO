"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import type { AssistantClient } from "./assistant-client";
import { ChatWindow } from "./chat-window";
import { createDemoAssistant } from "./demo-assistant";
import { PizzaiCharacter } from "./pizzai-character";

/** Páginas donde PizzAI no aparece, para no estorbar: el pago del pedido. */
const HIDDEN_ON = ["/pedido"];

/** Cada cuánto saluda (si el chat está cerrado) y cuánto dura el saludo. */
const GREET_FIRST_MS = 8_000;
const GREET_EVERY_MS = 40_000;
const GREET_FOR_MS = 4_000;

interface PizzaiAssistantProps {
  /** Quien genera las respuestas. Por defecto, el asistente de demostración. */
  client?: AssistantClient;
}

/** PizzAI: personaje flotante en la esquina inferior derecha que abre el chat al pulsarlo. */
export function PizzaiAssistant({ client }: PizzaiAssistantProps) {
  const pathname = usePathname();
  const assistant = useMemo(() => client ?? createDemoAssistant(), [client]);
  const [open, setOpen] = useState(false);
  const [greeting, setGreeting] = useState(false);
  const launcher = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const wasOpen = useRef(false);

  // Saludo ocasional con el chat cerrado, la pestaña visible y sin «reducir movimiento».
  useEffect(() => {
    if (open || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let hide: ReturnType<typeof setTimeout> | undefined;
    const greet = () => {
      if (document.visibilityState !== "visible") return;
      setGreeting(true);
      hide = setTimeout(() => setGreeting(false), GREET_FOR_MS);
    };
    const first = setTimeout(greet, GREET_FIRST_MS);
    const every = setInterval(greet, GREET_EVERY_MS);
    return () => {
      clearTimeout(first);
      clearInterval(every);
      clearTimeout(hide);
      setGreeting(false);
    };
  }, [open]);

  // El foco pasa al campo al abrir y vuelve al personaje al cerrar.
  useEffect(() => {
    if (open) input.current?.focus();
    else if (wasOpen.current) launcher.current?.focus();
    wasOpen.current = open;
  }, [open]);

  if (HIDDEN_ON.includes(pathname)) return null;

  return (
    <>
      {open ? (
        <ChatWindow client={assistant} inputRef={input} onClose={() => setOpen(false)} />
      ) : (
        <div className="fixed right-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 flex flex-col items-end gap-2 sm:right-4 sm:bottom-4">
          {greeting ? (
            <p
              role="status"
              className="bg-cream text-charcoal border-charcoal/20 pizzai-pop rounded-2xl rounded-br-sm border px-4 py-2 text-sm font-semibold shadow-lg"
            >
              ¡Hola! ¿Te ayudo?
            </p>
          ) : null}
          <button
            ref={launcher}
            type="button"
            aria-label="Abrir el chat con PizzAI"
            aria-expanded={false}
            onClick={() => setOpen(true)}
            className="pizzai-launcher focus-visible:outline-ring size-16 rounded-full drop-shadow-lg sm:size-20"
          >
            <span className={cn("block", greeting ? "pizzai-wave" : "pizzai-float")}>
              <PizzaiCharacter />
            </span>
          </button>
        </div>
      )}
    </>
  );
}
