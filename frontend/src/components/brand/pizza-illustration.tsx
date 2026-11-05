import { cn } from "@/lib/utils";

interface PizzaIllustrationProps {
  className?: string;
}

/**
 * Ilustración decorativa que ocupa el lugar de las fotografías gastronómicas.
 * Sustituir por fotografías reales cuando estén disponibles.
 */
export function PizzaIllustration({ className }: PizzaIllustrationProps) {
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox="0 0 200 200"
      className={cn("h-auto w-full", className)}
    >
      <circle cx="100" cy="100" r="92" fill="#D6A84B" />
      <circle cx="100" cy="100" r="80" fill="#D94A32" />
      <circle cx="100" cy="100" r="70" fill="#F5E6C8" opacity="0.92" />
      <g fill="#D94A32">
        <circle cx="72" cy="78" r="11" />
        <circle cx="122" cy="70" r="10" />
        <circle cx="136" cy="116" r="11" />
        <circle cx="90" cy="130" r="10" />
        <circle cx="64" cy="112" r="8" />
      </g>
      <g fill="#171717" opacity="0.8">
        <circle cx="72" cy="78" r="3" />
        <circle cx="122" cy="70" r="3" />
        <circle cx="136" cy="116" r="3" />
        <circle cx="90" cy="130" r="3" />
      </g>
      <g fill="#4d7c3a">
        <ellipse cx="104" cy="98" rx="9" ry="5" transform="rotate(-30 104 98)" />
        <ellipse cx="88" cy="100" rx="8" ry="4" transform="rotate(25 88 100)" />
        <ellipse cx="112" cy="132" rx="8" ry="4" transform="rotate(-10 112 132)" />
      </g>
    </svg>
  );
}
