"use client";

import { Trash2 } from "lucide-react";
import Image from "next/image";

import { PizzaIllustration } from "@/components/brand/pizza-illustration";
import { Button } from "@/components/ui/button";
import { formatEuro } from "@/lib/format";

import { useCartStore, type CartLine } from "./cart-store";
import { QuantityStepper } from "./quantity-stepper";
import type { Quote } from "./quote";

/** Importe de una línea según el presupuesto del servidor (si ya llegó). */
function lineTotal(quote: Quote | undefined, line: CartLine): string | null {
  const priced = quote?.lines.find(
    (item) =>
      item.productId === line.productId &&
      item.quantity === line.quantity &&
      (item.notes ?? null) === line.notes &&
      [...item.options.map((option) => option.optionId)].sort().join(",") ===
        [...line.optionIds].sort().join(","),
  );
  return priced?.lineTotal ?? null;
}

interface CartLinesProps {
  quote: Quote | undefined;
  /** Solo lectura (resumen del checkout): sin controles de cantidad. */
  readOnly?: boolean;
}

export function CartLines({ quote, readOnly = false }: CartLinesProps) {
  const lines = useCartStore((state) => state.lines);
  const setQuantity = useCartStore((state) => state.setQuantity);
  const remove = useCartStore((state) => state.remove);

  return (
    <ul className="divide-border divide-y">
      {lines.map((line) => {
        const total = lineTotal(quote, line);
        return (
          <li key={line.id} className="flex gap-3 py-4 first:pt-0">
            <div className="bg-cream-soft flex size-16 shrink-0 items-center justify-center rounded-lg p-1">
              {line.imageUrl ? (
                <Image
                  src={line.imageUrl}
                  alt={line.imageAlt}
                  width={64}
                  height={64}
                  className="size-full object-contain"
                />
              ) : (
                <PizzaIllustration />
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">
                  {readOnly ? `${line.quantity} × ` : ""}
                  {line.name}
                </p>
                {total ? <p className="font-bold whitespace-nowrap">{formatEuro(total)}</p> : null}
              </div>
              {line.optionSummary ? (
                <p className="text-muted-foreground text-sm">{line.optionSummary}</p>
              ) : null}
              {line.notes ? <p className="text-muted-foreground text-sm">«{line.notes}»</p> : null}
              {readOnly ? null : (
                <div className="flex items-center justify-between gap-2">
                  <QuantityStepper
                    value={line.quantity}
                    label={line.name}
                    onChange={(value) => setQuantity(line.id, value)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Quitar ${line.name} del pedido`}
                    onClick={() => remove(line.id)}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
