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
  address: "Calle Ejemplo 12, 28000 Madrid",
  phone: "+34 900 000 000",
  phoneHref: "tel:+34900000000",
  email: "hola@forno.example",
  mapsQuery: "Calle Ejemplo 12, 28000 Madrid",
  prepTimeMinutes: 20,
  deliveryTimeMinutes: 40,
  minimumOrder: "12.00",
  deliveryFee: "2.50",
  freeDeliveryFrom: "25.00",
} as const;

export const DEMO_OPENING_HOURS: OpeningPeriod[] = [
  { days: "Lunes", hours: "Cerrado" },
  { days: "Martes a jueves", hours: "13:00 – 16:00 y 20:00 – 23:00" },
  { days: "Viernes y sábado", hours: "13:00 – 16:00 y 20:00 – 00:00" },
  { days: "Domingo", hours: "13:00 – 17:00 y 20:00 – 23:00" },
];
