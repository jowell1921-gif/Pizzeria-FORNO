import { ViewTransition, type ReactNode } from "react";

const DIRECTIONAL = {
  "nav-forward": "nav-forward",
  "nav-back": "nav-back",
  default: "none",
} as const;

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

/**
 * Contenedor de página que anima la navegación entre rutas (View Transitions).
 * La animación depende de `transitionTypes` del enlace: «nav-forward» (adelante) y «nav-back»
 * (atrás). Las navegaciones sin tipo (botón «atrás» del navegador) no se animan.
 *
 * Debe usarse en cada `page.tsx`, no en el layout: los layouts persisten y no ejecutan
 * animaciones de entrada ni de salida.
 */
export function PageTransition({ children, className }: PageTransitionProps) {
  return (
    <ViewTransition enter={DIRECTIONAL} exit={DIRECTIONAL} default="none">
      <div className={className}>{children}</div>
    </ViewTransition>
  );
}
