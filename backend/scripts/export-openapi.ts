import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildOpenApiDocument } from "../src/docs/openapi.js";

/**
 * Exporta el contrato de la API a `docs/api/openapi.json` (npm run docs:openapi). Es el archivo que
 * se entrega a la app Flutter y a cualquier otro cliente: no depende de que el servidor esté en marcha.
 * Una prueba comprueba que el archivo guardado coincide siempre con el que genera el código.
 */
export const OPENAPI_FILE = resolve(import.meta.dirname, "../../docs/api/openapi.json");

export const serializeOpenApi = () => `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`;

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  writeFileSync(OPENAPI_FILE, serializeOpenApi());
  console.log(`Escrito ${OPENAPI_FILE}`);
}
