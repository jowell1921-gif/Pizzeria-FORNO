import { cn } from "@/lib/utils";

export type PizzaiMood = "idle" | "happy" | "typing";

interface PizzaiCharacterProps {
  mood?: PizzaiMood;
  className?: string;
}

/**
 * PizzAI: una pizza redonda con borde dorado, salsa, queso e ingredientes, y una cara amable.
 * Es decorativa (el nombre accesible lo da el botón o la cabecera que la contiene). Solo cambian
 * la boca y los ojos según el estado; la animación de parpadeo es CSS.
 */
export function PizzaiCharacter({ mood = "idle", className }: PizzaiCharacterProps) {
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox="0 0 200 200"
      className={cn("pizzai-body h-auto w-full", className)}
    >
      <circle cx="100" cy="104" r="92" fill="#171717" opacity="0.12" />
      <circle cx="100" cy="100" r="92" fill="#D6A84B" />
      <circle cx="100" cy="100" r="80" fill="#D94A32" />
      <circle cx="100" cy="100" r="71" fill="#F5E6C8" />

      <g fill="#C23B25">
        <circle cx="62" cy="68" r="11" />
        <circle cx="140" cy="64" r="10" />
        <circle cx="152" cy="110" r="10" />
        <circle cx="48" cy="112" r="9" />
        <circle cx="118" cy="154" r="10" />
        <circle cx="76" cy="150" r="9" />
      </g>
      <g fill="#171717" opacity="0.75">
        <circle cx="62" cy="68" r="2.6" />
        <circle cx="140" cy="64" r="2.6" />
        <circle cx="152" cy="110" r="2.6" />
        <circle cx="48" cy="112" r="2.6" />
        <circle cx="118" cy="154" r="2.6" />
        <circle cx="76" cy="150" r="2.6" />
      </g>
      <g fill="#4d7c3a">
        <ellipse cx="100" cy="52" rx="10" ry="5" transform="rotate(-20 100 52)" />
        <ellipse cx="86" cy="54" rx="8" ry="4" transform="rotate(25 86 54)" />
        <ellipse cx="162" cy="86" rx="8" ry="4" transform="rotate(70 162 86)" />
      </g>

      {/* Cara */}
      <ellipse cx="68" cy="116" rx="9" ry="6" fill="#D94A32" opacity="0.28" />
      <ellipse cx="132" cy="116" rx="9" ry="6" fill="#D94A32" opacity="0.28" />
      <g className="pizzai-eye" fill="#171717">
        <ellipse cx="80" cy="98" rx="6.5" ry={mood === "happy" ? 3.5 : 8} />
        <ellipse cx="120" cy="98" rx="6.5" ry={mood === "happy" ? 3.5 : 8} />
      </g>
      {mood === "happy" ? null : (
        <g fill="#fff">
          <circle cx="82" cy="95" r="2.2" />
          <circle cx="122" cy="95" r="2.2" />
        </g>
      )}
      {mood === "typing" ? (
        <ellipse cx="100" cy="124" rx="6" ry="4.5" fill="#171717" />
      ) : (
        <path
          d={mood === "happy" ? "M78 116 Q100 142 122 116 Z" : "M82 118 Q100 134 118 118"}
          fill={mood === "happy" ? "#171717" : "none"}
          stroke="#171717"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
