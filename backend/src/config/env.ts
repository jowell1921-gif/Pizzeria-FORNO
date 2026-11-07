import { z } from "zod";

const booleanString = z.enum(["true", "false"]).transform((value) => value === "true");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  /** Conexión a PostgreSQL. */
  DATABASE_URL: z.url(),
  /** URL del proyecto de Supabase (https://<ref>.supabase.co). De ahí salen el emisor y el JWKS. */
  SUPABASE_URL: z.url().transform((value) => value.replace(/\/+$/, "")),
  /** Nivel de los registros (logs). */
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  /**
   * Número de proxies de confianza delante de la API (0 = ninguno). En Railway es 1: sin él, todas
   * las peticiones parecerían venir de la misma IP y el límite de peticiones afectaría a todos.
   */
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  /** Publica la documentación (/api/v1/docs y openapi.json). Por defecto, solo fuera de producción. */
  API_DOCS_ENABLED: booleanString.optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return parsed.data;
}

/** ¿Se publica la documentación de la API? Por defecto sí, salvo en producción. */
export function docsEnabled(env: Pick<Env, "NODE_ENV" | "API_DOCS_ENABLED">): boolean {
  return env.API_DOCS_ENABLED ?? env.NODE_ENV !== "production";
}
