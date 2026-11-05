import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

interface AnimatedNumberProps {
  value: number;
  className?: string;
}

/**
 * Número que sube de 0 a `value` mientras se hace scroll (solo CSS, ver «Contadores animados»
 * en globals.css). El valor real está siempre en el HTML, así que se lee bien sin animación.
 */
export function AnimatedNumber({ value, className }: AnimatedNumberProps) {
  return (
    <span className={cn("counter", className)} style={{ "--target": value } as CSSProperties}>
      <span className="counter-text">{value}</span>
    </span>
  );
}
