import { z, type ZodType } from "zod";

/** URL base de la API del backend (sin barra final). */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1").replace(
  /\/+$/,
  "",
);

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  /** Access token de Supabase del usuario. El backend lo verifica en cada petición. Sin él, petición pública. */
  token?: string;
  /** Cabeceras adicionales (por ejemplo, Idempotency-Key). */
  headers?: Record<string, string>;
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number>;
}

/**
 * Hace la petición y devuelve el cuerpo JSON ya leído (o null si no hay cuerpo). Convierte los
 * errores en `ApiError`. Las respuestas correctas tienen la forma `{ data }` (o `{ data, meta }`
 * en listas) y las de error `{ error: { code, message } }` (ver docs/api).
 */
async function send(path: string, options: RequestOptions): Promise<unknown> {
  const url = new URL(`${API_URL}${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    url.searchParams.set(key, String(value));
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        ...options.headers,
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "No se pudo conectar con el servidor.");
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(
      response.status,
      error?.code ?? "UNKNOWN_ERROR",
      error?.message ?? "Error inesperado del servidor.",
    );
  }
  return payload;
}

/** Petición cuyo resultado es `{ data }`; se valida `data` con el esquema. */
export async function apiRequest<T>(
  path: string,
  options: RequestOptions & { schema: ZodType<T> },
): Promise<T> {
  const payload = await send(path, options);
  return options.schema.parse((payload as { data?: unknown } | null)?.data);
}

const metaSchema = z.object({
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
  totalPages: z.number(),
});

export type PageMeta = z.infer<typeof metaSchema>;

/** Petición de una lista paginada: `{ data: [...], meta }`. */
export async function apiRequestPage<T>(
  path: string,
  options: RequestOptions & { schema: ZodType<T> },
): Promise<{ data: T[]; meta: PageMeta }> {
  const payload = await send(path, options);
  return z.object({ data: z.array(options.schema), meta: metaSchema }).parse(payload);
}

/** Petición sin contenido en la respuesta (por ejemplo, un borrado: 204). */
export async function apiRequestVoid(path: string, options: RequestOptions): Promise<void> {
  await send(path, options);
}
