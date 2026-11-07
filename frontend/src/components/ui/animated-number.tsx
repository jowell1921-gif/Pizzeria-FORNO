"use client";

import { useEffect, useRef, type CSSProperties } from "react";

import { cn } from "@/lib/utils";

interface AnimatedNumberProps {
  value: number;
  className?: string;
}

/**
 * Número que sube de 0 a `value` en unos segundos cuando entra en pantalla (ver «Contadores
 * animados» en globals.css).
 *
 * El valor real está siempre en el HTML, así que sin JavaScript, con «reducir movimiento» o en un
 * lector de pantalla se ve y se lee el número final. El estado se guarda en `data-counter`
 * (ausente → «armed» → «running») y no en el estado de React, porque solo afecta a los estilos.
 */
export function AnimatedNumber({ value, className }: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    element.dataset.counter = "armed";
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          element.dataset.counter = "running";
          observer.disconnect();
        }
      },
      { threshold: 0.6 },
    );
    observer.observe(element);

    return () => {
      observer.disconnect();
      delete element.dataset.counter;
    };
  }, []);

  return (
    <span
      ref={ref}
      className={cn("counter", className)}
      style={{ "--target": value } as CSSProperties}
    >
      <span className="counter-text">{value}</span>
    </span>
  );
}
