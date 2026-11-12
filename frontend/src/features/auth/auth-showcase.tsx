import { Gift, Percent, Pizza, Star, Ticket, Truck, type LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";

interface FloatingIcon {
  icon: LucideIcon;
  /** Posición (%) dentro del panel. */
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
  tone: "tomato" | "gold" | "cream";
}

// Posiciones fijas (no aleatorias) para que el HTML del servidor y del navegador coincidan.
const ICONS: FloatingIcon[] = [
  { icon: Percent, x: 10, y: 6, size: 56, duration: 7, delay: 0, tone: "tomato" },
  { icon: Gift, x: 72, y: 5, size: 52, duration: 8, delay: -2, tone: "gold" },
  { icon: Star, x: 84, y: 26, size: 44, duration: 6, delay: -4, tone: "cream" },
  { icon: Truck, x: 8, y: 27, size: 48, duration: 9, delay: -1, tone: "gold" },
  { icon: Pizza, x: 62, y: 34, size: 58, duration: 7.5, delay: -3, tone: "tomato" },
  { icon: Ticket, x: 38, y: 14, size: 50, duration: 8.5, delay: -5, tone: "cream" },
];

const TONES: Record<FloatingIcon["tone"], string> = {
  tomato: "bg-tomato-strong text-white",
  gold: "bg-gold text-charcoal",
  cream: "bg-cream text-charcoal",
};

const PERKS = [
  "Suma puntos en cada pedido con FORNEA CLUB",
  "Canjea tus puntos por recompensas",
  "Promociones y cupones solo para clientes",
];

/**
 * Panel decorativo de las páginas de acceso: iconos de promociones, puntos y reparto que flotan
 * sobre un fondo de brasas, distinto del hero de la página principal. Con «reducir movimiento»
 * los iconos se quedan quietos.
 */
export function AuthShowcase() {
  return (
    <aside
      aria-label="Ventajas de tener cuenta en FORNEA"
      className="auth-showcase bg-charcoal text-cream relative isolate hidden min-h-[34rem] overflow-hidden rounded-2xl lg:flex lg:flex-col lg:justify-end"
    >
      <div aria-hidden className="auth-ring absolute top-1/2 left-1/2 -z-10" />
      <div aria-hidden className="auth-ring auth-ring-inner absolute top-1/2 left-1/2 -z-10" />

      {ICONS.map(({ icon: Icon, x, y, size, duration, delay, tone }) => (
        <span
          key={tone + x}
          aria-hidden
          className={`auth-chip absolute flex items-center justify-center rounded-2xl shadow-xl ${TONES[tone]}`}
          style={
            {
              left: `${x}%`,
              top: `${y}%`,
              width: size,
              height: size,
              "--dur": `${duration}s`,
              "--delay": `${delay}s`,
            } as CSSProperties
          }
        >
          <Icon className="size-1/2" />
        </span>
      ))}

      <div className="relative space-y-5 p-8">
        <p className="bg-cream text-charcoal auth-ticket w-fit rounded-xl px-4 py-3 shadow-lg">
          <span className="block text-xs font-bold tracking-widest uppercase">Bienvenida</span>
          <span className="font-heading block text-3xl leading-none font-extrabold">
            -10 % en tu primer pedido
          </span>
        </p>
        <p className="font-heading text-5xl leading-[0.95] font-extrabold uppercase">
          Tu cuenta, <span className="text-tomato">tus puntos</span>
        </p>
        <ul className="space-y-2 text-sm">
          {PERKS.map((perk) => (
            <li key={perk} className="flex items-start gap-2">
              <Star aria-hidden className="text-gold mt-0.5 size-4 shrink-0" />
              {perk}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

/** Versión compacta para móvil y tablet: una franja con las ventajas principales. */
export function AuthPerksStrip() {
  return (
    <ul
      aria-label="Ventajas de tener cuenta en FORNEA"
      className="bg-charcoal text-cream flex flex-wrap justify-center gap-x-5 gap-y-2 rounded-2xl px-4 py-3 text-sm lg:hidden"
    >
      {[
        { icon: Percent, text: "-10 % en tu primer pedido" },
        { icon: Star, text: "Puntos en cada pedido" },
        { icon: Gift, text: "Recompensas" },
      ].map(({ icon: Icon, text }) => (
        <li key={text} className="flex items-center gap-2">
          <Icon aria-hidden className="text-gold size-4" />
          {text}
        </li>
      ))}
    </ul>
  );
}
