import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface CardSectionProps {
  id: string;
  title: string;
  icon: LucideIcon;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Tarjeta de una sección de «Mi cuenta», con título (h2), icono y una acción opcional. */
export function CardSection({
  id,
  title,
  icon: Icon,
  action,
  className,
  children,
}: CardSectionProps) {
  return (
    <section
      aria-labelledby={id}
      className={cn(
        "border-border bg-card space-y-4 rounded-2xl border p-5 shadow-sm sm:p-6",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id={id} className="flex items-center gap-2 text-2xl leading-none font-bold">
          <Icon aria-hidden className="text-tomato-strong size-6" />
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Mensaje de carga, de error con reintento o de contenido vacío dentro de una tarjeta. */
export function CardMessage({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground text-sm">{children}</p>;
}
