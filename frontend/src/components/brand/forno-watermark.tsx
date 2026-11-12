import { cn } from "@/lib/utils";

interface FornoWatermarkProps {
  /** `dark`: trazo crema para fondos oscuros. `light`: trazo carbón para fondos claros. */
  tone?: "dark" | "light";
  className?: string;
}

/**
 * Marca de agua «FORNEA» en contorno, detrás del contenido. Es decorativa (`aria-hidden`).
 * Debe colocarse en un contenedor `relative isolate overflow-hidden`; la posición vertical se
 * indica con `className` (por ejemplo `top-1/2 -translate-y-1/2`).
 */
export function FornoWatermark({ tone = "dark", className }: FornoWatermarkProps) {
  return (
    <div
      aria-hidden
      className={cn(
        "font-heading pointer-events-none absolute inset-x-0 -z-10 text-center text-[clamp(9rem,30vw,24rem)] leading-none font-extrabold whitespace-nowrap text-transparent select-none",
        tone === "dark"
          ? "[-webkit-text-stroke:2px_rgba(245,230,200,0.09)]"
          : "[-webkit-text-stroke:2px_rgba(23,23,23,0.13)]",
        className,
      )}
    >
      FORNEA
    </div>
  );
}
