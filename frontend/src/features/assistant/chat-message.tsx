import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { ChatMessage } from "./assistant-client";

/** Una burbuja de la conversación. El texto se muestra siempre como texto, nunca como HTML. */
export function ChatBubble({
  message,
  onNavigate,
}: {
  message: ChatMessage;
  onNavigate: () => void;
}) {
  const mine = message.role === "user";
  return (
    <li className={cn("pizzai-pop flex flex-col gap-1", mine ? "items-end" : "items-start")}>
      <p
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed break-words",
          mine
            ? "bg-tomato-strong rounded-br-sm text-white"
            : "bg-card border-border text-foreground rounded-bl-sm border",
        )}
      >
        <span className="sr-only">{mine ? "Tú: " : "PizzAI: "}</span>
        {message.text}
      </p>
      {message.links?.length ? (
        <div className="flex max-w-[85%] flex-wrap gap-2">
          {message.links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={onNavigate}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "min-h-11")}
            >
              {link.label}
            </Link>
          ))}
        </div>
      ) : null}
      {message.ai ? (
        <span className="text-muted-foreground text-xs">
          Generado por IA: puede contener errores
        </span>
      ) : null}
      {message.provisional ? (
        <span className="text-muted-foreground text-xs">
          Respuesta de demostración (provisional)
        </span>
      ) : null}
    </li>
  );
}
