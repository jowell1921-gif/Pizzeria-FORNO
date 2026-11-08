"use client";

import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

import { MAX_LINE_QUANTITY } from "./cart-store";

interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  /** Nombre del producto, para los lectores de pantalla. */
  label: string;
  /** Permite llegar a 0 (para quitar la línea). */
  allowZero?: boolean;
}

/** Control de cantidad con botones táctiles de 44 px. */
export function QuantityStepper({
  value,
  onChange,
  label,
  allowZero = false,
}: QuantityStepperProps) {
  const min = allowZero ? 0 : 1;
  return (
    <div
      role="group"
      aria-label={`Cantidad de ${label}`}
      className="inline-flex items-center gap-1"
    >
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={`Quitar una unidad de ${label}`}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
      >
        <Minus aria-hidden />
      </Button>
      <span aria-live="polite" className="min-w-8 text-center text-base font-bold tabular-nums">
        {value}
      </span>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={`Añadir una unidad de ${label}`}
        disabled={value >= MAX_LINE_QUANTITY}
        onClick={() => onChange(value + 1)}
      >
        <Plus aria-hidden />
      </Button>
    </div>
  );
}
