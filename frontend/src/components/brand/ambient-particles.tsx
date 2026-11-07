import type { CSSProperties } from "react";

interface Leaf {
  /** Posición horizontal (%). */
  x: number;
  /** Anchura de la hoja (px). */
  size: number;
  /** Duración de la caída (s). */
  duration: number;
  /** Retraso negativo (s): las hojas ya están a medio caer al cargar la página. */
  delay: number;
  /** Amplitud del balanceo (px) y del giro (grados). */
  sway: number;
  spin: number;
  /** Opacidad máxima y color. */
  alpha: number;
  color: string;
}

interface Ember {
  x: number;
  size: number;
  duration: number;
  delay: number;
  /** Desviación horizontal al subir (px). */
  drift: number;
}

// Valores fijos (no aleatorios) para que el HTML del servidor y del navegador coincidan.
const LEAVES: Leaf[] = [
  { x: 4, size: 26, duration: 15, delay: -3, sway: 28, spin: 40, alpha: 0.85, color: "#6aa04e" },
  { x: 13, size: 18, duration: 11, delay: -9, sway: 20, spin: 55, alpha: 0.6, color: "#7db85c" },
  { x: 22, size: 32, duration: 17, delay: -12, sway: 34, spin: 35, alpha: 0.9, color: "#5a9341" },
  { x: 31, size: 20, duration: 12, delay: -6, sway: 22, spin: 60, alpha: 0.55, color: "#6aa04e" },
  { x: 41, size: 28, duration: 16, delay: -1, sway: 30, spin: 45, alpha: 0.8, color: "#6aa04e" },
  { x: 52, size: 16, duration: 10, delay: -8, sway: 18, spin: 70, alpha: 0.5, color: "#7db85c" },
  { x: 61, size: 30, duration: 18, delay: -14, sway: 36, spin: 38, alpha: 0.9, color: "#5a9341" },
  { x: 70, size: 22, duration: 13, delay: -4, sway: 24, spin: 52, alpha: 0.65, color: "#6aa04e" },
  { x: 79, size: 26, duration: 15, delay: -10, sway: 28, spin: 42, alpha: 0.8, color: "#6aa04e" },
  { x: 87, size: 18, duration: 11, delay: -2, sway: 20, spin: 62, alpha: 0.55, color: "#7db85c" },
  { x: 94, size: 30, duration: 17, delay: -7, sway: 32, spin: 36, alpha: 0.85, color: "#5a9341" },
  { x: 47, size: 24, duration: 14, delay: -11, sway: 26, spin: 48, alpha: 0.7, color: "#6aa04e" },
];

const EMBERS: Ember[] = [
  { x: 8, size: 4, duration: 7, delay: -1, drift: 18 },
  { x: 17, size: 3, duration: 9, delay: -5, drift: -14 },
  { x: 26, size: 5, duration: 8, delay: -3, drift: 22 },
  { x: 36, size: 3, duration: 10, delay: -8, drift: -20 },
  { x: 45, size: 4, duration: 7, delay: -6, drift: 12 },
  { x: 55, size: 3, duration: 9, delay: -2, drift: -16 },
  { x: 64, size: 5, duration: 8, delay: -7, drift: 20 },
  { x: 73, size: 4, duration: 10, delay: -4, drift: -12 },
  { x: 82, size: 3, duration: 7, delay: -9, drift: 16 },
  { x: 91, size: 4, duration: 9, delay: -3, drift: -18 },
];

function LeafShape({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 34" focusable="false" aria-hidden>
      <path d="M12 1C21 9 23 22 12 33C1 22 3 9 12 1Z" fill={color} />
      <path
        d="M12 5V31M12 14L7 10M12 20L6.5 15M12 14L17 10M12 20L17.5 15"
        stroke="rgba(0,0,0,0.28)"
        strokeWidth="0.9"
        fill="none"
      />
    </svg>
  );
}

/**
 * Fondo animado sobre carbón: hojas de albahaca que caen y chispas de brasa que suben.
 * Puramente decorativo; los estilos están en globals.css («Fondo animado»).
 *
 * Debe colocarse dentro de un contenedor con `relative isolate overflow-hidden`: las partículas
 * ocupan todo el contenedor y quedan detrás de su contenido.
 */
export function AmbientParticles() {
  return (
    <div aria-hidden className="ambient-particles -z-10">
      {LEAVES.map((leaf, index) => (
        <span
          key={`leaf-${index}`}
          className="ambient-leaf"
          style={
            {
              "--x": `${leaf.x}%`,
              "--size": `${Math.round(leaf.size * 1.6)}px`,
              "--dur": `${leaf.duration}s`,
              "--delay": `${leaf.delay}s`,
              "--sway": `${leaf.sway}px`,
              "--spin": `${leaf.spin}deg`,
              "--alpha": leaf.alpha,
            } as CSSProperties
          }
        >
          <LeafShape color={leaf.color} />
        </span>
      ))}
      {EMBERS.map((ember, index) => (
        <span
          key={`ember-${index}`}
          className="ambient-ember"
          style={
            {
              "--x": `${ember.x}%`,
              "--size": `${ember.size * 1.8}px`,
              "--dur": `${ember.duration}s`,
              "--delay": `${ember.delay}s`,
              "--drift": `${ember.drift}px`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
