import { DEMO_STORE } from "@/lib/demo-data";

/** Fecha de la última revisión de los textos legales. */
export const LEGAL_UPDATED = "12 de noviembre de 2026";

/**
 * Datos del titular que aparecen en los textos legales. Es el ÚNICO sitio donde hay que editarlos.
 * Lo que está entre corchetes todavía no se conoce: sustitúyelo por el dato real del titular
 * (la web lo muestra tal cual, así que no se publica nada inventado).
 */
export const COMPANY = {
  name: "Lowbit Kode",
  brand: "FORNEA",
  taxId: "[NIF/CIF pendiente de completar]",
  registeredAddress: "[Domicilio social pendiente de completar]",
  email: "[Correo de contacto pendiente de completar]",
  registry: "[Datos del Registro Mercantil pendientes de completar, si procede]",
  phone: DEMO_STORE.phone,
  establishment: DEMO_STORE.address,
} as const;
