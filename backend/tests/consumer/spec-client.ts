import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

import SwaggerParser from "@apidevtools/swagger-parser";

// ajv y ajv-formats son paquetes CommonJS: se cargan con require para evitar problemas de tipos de ESM.
const require = createRequire(import.meta.url);
interface AjvCheck {
  (value: unknown): boolean;
  errors?: Array<{ instancePath: string; message?: string }> | null;
}
interface AjvLike {
  compile(schema: object): AjvCheck;
}
const Ajv2020 = require("ajv/dist/2020") as new (options: object) => AjvLike;
const addFormats = require("ajv-formats") as (ajv: AjvLike) => void;

/**
 * Cliente de la API **independiente de la aplicación**, como lo sería la app Flutter: solo conoce el
 * contrato publicado (`docs/api/openapi.json`) y HTTP. No importa ningún módulo del servidor. Para cada
 * llamada: monta la URL desde la operación (por su `operationId`), valida lo que envía y valida
 * lo que recibe (estado, cuerpo y errores) contra los esquemas del contrato.
 */
const CONTRACT = resolve(import.meta.dirname, "../../../docs/api/openapi.json");

interface Operation {
  method: string;
  path: string;
  definition: {
    parameters?: Array<{ name: string; in: string; required?: boolean; schema?: unknown }>;
    requestBody?: { content: { "application/json": { schema: unknown } } };
    responses: Record<string, { content?: { "application/json": { schema: unknown } } }>;
  };
}

export interface CallOptions {
  /** Valores de los parámetros de la ruta, por ejemplo `{ id: "…" }`. */
  path?: Record<string, string>;
  query?: Record<string, string | number>;
  body?: unknown;
  /** Access token de Supabase (se envía como `Authorization: Bearer`). */
  token?: string;
  headers?: Record<string, string>;
  /** Para pruebas negativas: enviar un cuerpo que el contrato no permite. */
  skipRequestValidation?: boolean;
}

// El cuerpo se valida contra el contrato; las pruebas lo leen como JSON libre.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface CallResult<T = any> {
  status: number;
  body: T;
  headers: Headers;
}

export interface Exchange {
  operationId: string;
  method: string;
  url: string;
  authenticated: boolean;
  idempotencyKey: boolean;
  requestBody: unknown;
  status: number;
  responseBody: unknown;
}

export async function createSpecClient(baseUrl: string) {
  const spec = (await SwaggerParser.dereference(
    JSON.parse(readFileSync(CONTRACT, "utf8")),
  )) as unknown as {
    servers: Array<{ url: string }>;
    paths: Record<string, Record<string, Operation["definition"] & { operationId: string }>>;
  };
  const operations = new Map<string, Operation>();
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const [method, definition] of Object.entries(item)) {
      operations.set(definition.operationId, { method: method.toUpperCase(), path, definition });
    }
  }

  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  const called = new Set<string>();
  const exchanges: Exchange[] = [];

  function validate(schema: unknown, value: unknown, what: string) {
    const check = ajv.compile(schema as object);
    if (!check(value)) {
      const detail = (check.errors ?? [])
        .slice(0, 4)
        .map((error) => `${error.instancePath || "/"} ${error.message}`)
        .join("; ");
      throw new Error(`${what} does not match the contract: ${detail}`);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function call<T = any>(
    operationId: string,
    options: CallOptions = {},
  ): Promise<CallResult<T>> {
    const operation = operations.get(operationId);
    if (!operation) throw new Error(`The contract has no operation "${operationId}"`);
    called.add(operationId);

    let path = operation.path;
    for (const [name, value] of Object.entries(options.path ?? {})) {
      path = path.replace(`{${name}}`, encodeURIComponent(value));
    }
    if (/\{\w+\}/.test(path)) throw new Error(`Missing path parameters for ${operation.path}`);
    const url = new URL(`${baseUrl}${spec.servers[0]!.url}${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      url.searchParams.set(key, String(value));
    }

    const requestSchema = operation.definition.requestBody?.content["application/json"].schema;
    if (requestSchema && options.body !== undefined && !options.skipRequestValidation) {
      validate(requestSchema, options.body, `${operationId} request`);
    }

    const response = await fetch(url, {
      method: operation.method,
      headers: {
        Accept: "application/json",
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...options.headers,
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    const isJson = (response.headers.get("content-type") ?? "").includes("json");
    const body = isJson ? await response.json() : await response.arrayBuffer();

    const documented = operation.definition.responses[String(response.status)];
    if (!documented) {
      throw new Error(
        `${operationId} answered ${response.status}, which the contract does not document`,
      );
    }
    const schema = documented.content?.["application/json"]?.schema;
    if (schema && isJson) validate(schema, body, `${operationId} ${response.status} response`);

    exchanges.push({
      operationId,
      method: operation.method,
      url: `${spec.servers[0]!.url}${path}${url.search}`,
      authenticated: Boolean(options.token),
      idempotencyKey: Boolean(options.headers?.["Idempotency-Key"]),
      requestBody: options.body,
      status: response.status,
      responseBody: isJson ? body : undefined,
    });
    return { status: response.status, body: body as T, headers: response.headers };
  }

  return {
    call,
    /** Operaciones que se han llamado y las que el contrato documenta (para medir la cobertura). */
    coverage: () => ({ called: [...called].sort(), total: operations.size }),
    operationIds: () => [...operations.keys()],
    /** Todas las llamadas hechas (para generar los ejemplos de la documentación). */
    exchanges: () => exchanges,
  };
}

export type SpecClient = Awaited<ReturnType<typeof createSpecClient>>;
