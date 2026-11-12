import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type { Exchange } from "./spec-client.js";

/**
 * Genera `docs/flutter/ejemplos.md` con peticiones y respuestas REALES del servidor (las del viaje de
 * `mobile-journey.test.ts`). Se regenera con `UPDATE_EXAMPLES=1 npm run test:db -- tests/consumer`.
 */
const OUTPUT = resolve(import.meta.dirname, "../../../docs/flutter/ejemplos.md");

/** Operación, estado y título. */
const SELECTION: Array<[string, number, string]> = [
  ["getProducts", 200, "Carta (pública)"],
  ["getProductsByIdOrSlug", 200, "Producto con opciones, ingredientes y alérgenos (pública)"],
  [
    "postCheckoutQuote",
    200,
    "Presupuesto del carrito (pública): el servidor calcula todos los importes",
  ],
  ["getMe", 401, "Error sin sesión"],
  ["getMe", 200, "Mi perfil (la primera llamada con sesión lo crea)"],
  ["patchMe", 200, "Completar mis datos (necesario para pedir)"],
  ["postMeAddresses", 201, "Añadir una dirección"],
  ["postOrders", 201, "Crear un pedido en efectivo (con `Idempotency-Key`)"],
  ["postOrders", 400, "Error de validación: el cliente no puede enviar precios"],
  ["getOrdersMe", 200, "Mis pedidos (paginado)"],
  ["getOrdersById", 200, "Detalle y seguimiento de un pedido"],
  ["postOrdersByIdPaymentSession", 200, "Iniciar el pago con tarjeta: la app abre la URL devuelta"],
  ["getLoyaltyAccount", 200, "Mi saldo de FORNO CLUB"],
  ["postLoyaltyRedemptions", 409, "Error de negocio: puntos insuficientes"],
  ["postAssistantChat", 200, "Conversación con PizzAI (pública)"],
];

/** Acorta listas largas para que el ejemplo se lea de un vistazo. */
function shorten(value: unknown, depth = 0): unknown {
  if (Array.isArray(value)) {
    const items = value.slice(0, 2).map((item) => shorten(item, depth + 1));
    return value.length > 2 ? [...items, `… (${value.length - 2} más)`] : items;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, shorten(item, depth + 1)]),
    );
  }
  return value;
}

const json = (value: unknown) => JSON.stringify(shorten(value), null, 2);

export function writeExamples(exchanges: readonly Exchange[]) {
  const sections: string[] = [
    "# Ejemplos de peticiones y respuestas",
    "",
    "Generados automáticamente con las respuestas **reales** del servidor (`UPDATE_EXAMPLES=1 npm run test:db -- tests/consumer` en `backend/`).",
    "Los identificadores, fechas y números de pedido cambian en cada ejecución; la forma, no.",
    "Las listas largas se acortan con «… (N más)». `$API` es la URL base, por ejemplo `https://api.forno.ejemplo/api/v1`;",
    "`$TOKEN` es el access token de Supabase de la persona que ha iniciado sesión.",
    "",
  ];
  for (const [operationId, status, title] of SELECTION) {
    const exchange = exchanges.find(
      (item) => item.operationId === operationId && item.status === status,
    );
    if (!exchange) throw new Error(`No example recorded for ${operationId} ${status}`);
    const url = exchange.url.replace(/^\/api\/v1/, "$API");
    const headers = [
      exchange.authenticated ? '  -H "Authorization: Bearer $TOKEN" \\' : null,
      exchange.idempotencyKey ? '  -H "Idempotency-Key: $(uuidgen)" \\' : null,
      exchange.requestBody !== undefined ? '  -H "Content-Type: application/json" \\' : null,
    ].filter((line): line is string => line !== null);
    const body =
      exchange.requestBody !== undefined
        ? `  -d '${JSON.stringify(exchange.requestBody)}' \\\n`
        : "";
    sections.push(
      `## ${title}`,
      "",
      `\`${exchange.operationId}\` → \`${exchange.method} ${exchange.url.split("?")[0]}\``,
      "",
      "```bash",
      `curl -X ${exchange.method} "${url}" \\`,
      ...headers,
      `${body}  -H "Accept: application/json"`,
      "```",
      "",
      `Respuesta \`${status}\`:`,
      "",
      "```json",
      json(exchange.responseBody),
      "```",
      "",
    );
  }
  writeFileSync(OUTPUT, sections.join("\n"));
}
