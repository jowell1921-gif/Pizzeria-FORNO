import { DEMO_STORE } from "@/lib/demo-data";

/** Fecha de la última revisión de los textos legales. */
export const LEGAL_UPDATED = "13 de noviembre de 2026";

/**
 * Datos que aparecen en los textos legales. Es el ÚNICO sitio donde hay que editarlos.
 *
 * Lowbit Kode todavía no está constituida como actividad económica, por lo que no se muestran NIF,
 * domicilio social ni correo del titular. Antes de aceptar pedidos reales hay que añadirlos aquí (y
 * actualizar el apartado «Titular» del aviso legal): la LSSI-CE exige identificar a quien presta el
 * servicio.
 */
export const COMPANY = {
  name: "Lowbit Kode",
  brand: "FORNEA",
  phone: DEMO_STORE.phone,
  establishment: DEMO_STORE.address,
} as const;
