"use client";

import { CalendarDays, Check, Copy } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Promotion } from "@/types/menu";

interface PromotionCardProps {
  promotion: Promotion;
  showConditions?: boolean;
}

function CopyCodeButton({ code }: { code: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2500);
  }

  return (
    <div className="space-y-2">
      <div className="bg-cream border-border flex items-center justify-between gap-3 rounded-xl border-2 border-dashed p-3">
        <code className="font-mono text-2xl font-bold tracking-wider break-all">{code}</code>
        <Button type="button" onClick={copy}>
          {state === "copied" ? <Check aria-hidden /> : <Copy aria-hidden />}
          {state === "copied" ? "Copiado" : "Copiar código"}
        </Button>
      </div>
      <p role="status" className="text-muted-foreground text-xs">
        {state === "copied"
          ? "Código copiado al portapapeles."
          : state === "failed"
            ? "No se pudo copiar automáticamente: selecciona el código y cópialo."
            : "Introdúcelo al hacer tu pedido."}
      </p>
    </div>
  );
}

/** Tarjeta de promoción. Al pulsarla se abre una ventana con el detalle y el código para copiar. */
export function PromotionCard({ promotion, showConditions = false }: PromotionCardProps) {
  const headingId = `promo-${promotion.id}`;

  return (
    <Dialog>
      <article
        aria-labelledby={headingId}
        className="scroll-reveal card-interactive border-border bg-cream relative flex h-full flex-col gap-3 rounded-2xl border p-6"
      >
        <Badge className="bg-charcoal text-cream w-fit">{promotion.badge}</Badge>
        <h3 id={headingId} className="text-3xl leading-none font-bold">
          <DialogTrigger className="focus-visible:after:ring-ring/60 cursor-pointer text-left outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-3">
            {promotion.title}
          </DialogTrigger>
        </h3>
        <p className="text-sm">{promotion.description}</p>

        {promotion.code ? (
          <p className="text-sm">
            Código:{" "}
            <code className="bg-background rounded-md border px-2 py-1 font-mono font-bold">
              {promotion.code}
            </code>
          </p>
        ) : null}

        <p className="text-muted-foreground mt-auto flex items-center gap-2 text-xs">
          <CalendarDays aria-hidden className="size-4 shrink-0" />
          {promotion.validity}
        </p>

        {showConditions ? (
          <div>
            <p className="text-sm font-semibold">Condiciones</p>
            <ul className="text-muted-foreground mt-1 list-disc space-y-1 pl-5 text-sm">
              {promotion.conditions.map((condition) => (
                <li key={condition}>{condition}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </article>

      <DialogContent>
        <div className="bg-charcoal text-cream space-y-2 p-6 pr-16">
          <Badge className="bg-gold text-charcoal w-fit">{promotion.badge}</Badge>
          <DialogTitle className="text-cream">{promotion.title}</DialogTitle>
        </div>
        <div className="space-y-4 p-6">
          <DialogDescription className="text-foreground text-base">
            {promotion.description}
          </DialogDescription>

          {promotion.code ? (
            <CopyCodeButton code={promotion.code} />
          ) : (
            <p className="bg-cream-soft rounded-xl p-3 text-sm">
              Esta promoción no necesita código.
            </p>
          )}

          <div>
            <p className="text-sm font-semibold">Condiciones</p>
            <ul className="text-muted-foreground mt-1 list-disc space-y-1 pl-5 text-sm">
              {promotion.conditions.map((condition) => (
                <li key={condition}>{condition}</li>
              ))}
            </ul>
          </div>

          <p className="text-muted-foreground flex items-center gap-2 text-xs">
            <CalendarDays aria-hidden className="size-4 shrink-0" />
            {promotion.validity}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
