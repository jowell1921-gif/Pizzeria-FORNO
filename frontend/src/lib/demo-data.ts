/**
 * DATOS DE DEMOSTRACIÓN.
 *
 * Todo lo que hay en este archivo es de ejemplo: no son datos comerciales reales.
 * La carta, las promociones y FORNEA CLUB ya salen de la API (PostgreSQL); aquí quedan los datos del
 * local que se mostrarán desde la API cuando exista el panel de administración (fase 8).
 */
import type { OpeningPeriod } from "@/types/menu";

export const DEMO_STORE = {
  name: "FORNEA",
  tagline: "Pizza al horno de leña, directa a tu mesa",
  address: "Avenida de Asturias, 28029 Madrid",
  phone: "+34 631 00 85 76",
  phoneHref: "tel:+34631008576",
  email: "hola@fornea.example",
  mapsQuery: "Avenida de Asturias, 28029 Madrid",
  prepTimeMinutes: 20,
  deliveryTimeMinutes: 40,
  minimumOrder: "12.00",
  deliveryFee: "2.50",
  freeDeliveryFrom: "25.00",
} as const;

/** Aviso de dónde se reparte. Debe coincidir con las zonas de reparto configuradas en el panel. */
export const DELIVERY_NOTICE = {
  short: "repartimos en toda la Comunidad de Madrid (códigos postales que empiezan por 28).",
  title: "Reparto a domicilio",
  text: "Repartimos en toda la Comunidad de Madrid (códigos postales que empiezan por 28).",
} as const;

export const DEMO_OPENING_HOURS: OpeningPeriod[] = [
  { days: "Lunes", hours: "Cerrado" },
  { days: "Martes a jueves", hours: "13:00 – 16:00 y 20:00 – 23:00" },
  { days: "Viernes y sábado", hours: "13:00 – 16:00 y 20:00 – 00:00" },
  { days: "Domingo", hours: "13:00 – 17:00 y 20:00 – 23:00" },
];
