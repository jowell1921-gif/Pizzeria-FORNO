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
  /**
   * Clave secreta de Supabase (`sb_secret_…`), solo para subir imágenes a Storage. Opcional: sin ella
   * la subida de fotos queda desactivada. Nunca debe llegar al navegador ni a Flutter.
   */
  SUPABASE_SECRET_KEY: z.string().min(20).optional(),
  /** Bucket público de Storage para las fotos de producto. */
  SUPABASE_STORAGE_BUCKET: z.string().min(3).max(63).default("products"),
  /**
   * Stripe (pagos online). Con la clave secreta Y el secreto del webhook el pago online queda
   * disponible; sin alguno de los dos no se ofrece. Usa siempre claves de prueba (sk_test_…) fuera de
   * producción. Nunca deben llegar al navegador.
   */
  STRIPE_SECRET_KEY: z.string().min(20).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(10).optional(),
  /** URL pública de la web (a donde vuelve el cliente tras pagar). Por defecto, el primer origen de CORS. */
  FRONTEND_URL: z.url().optional(),
  /**
   * Correo transaccional. `log`: se redacta y se guarda sin enviar (se puede leer en el panel).
   * `resend`: se envía con Resend (requiere RESEND_API_KEY).
   */
  EMAIL_DRIVER: z.enum(["log", "resend"]).default("log"),
  RESEND_API_KEY: z.string().min(10).optional(),
  /** Remitente. Sin dominio verificado en Resend solo vale «FORNO <onboarding@resend.dev>». */
  EMAIL_FROM: z.string().min(3).default("FORNO <onboarding@resend.dev>"),
  /**
   * Si se indica, solo se envían correos a esa dirección (la de tu cuenta de Resend, mientras no haya
   * dominio verificado). El resto se registra sin enviar.
   */
  EMAIL_ONLY_TO: z.email().optional(),
  /** Nivel de los registros (logs). */
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  /**
   * Número de proxies de confianza delante de la API (0 = ninguno). En Railway es 1: sin él, todas
   * las peticiones parecerían venir de la misma IP y el límite de peticiones afectaría a todos.
   */
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  /** Publica la documentación (/api/v1/docs y openapi.json). Por defecto, solo fuera de producción. */
  API_DOCS_ENABLED: booleanString.optional(),
  /**
   * Permite que cada usuario se haga administrador a sí mismo desde «Mi cuenta» (solo para la demo,
   * para que cualquiera pueda probar todo el panel). Por defecto está ACTIVADO, también en
   * producción, porque la web es una demostración. En un negocio real hay que ponerlo en false:
   * los roles los asigna un administrador.
   */
  SELF_ADMIN_ENABLED: booleanString.optional(),
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

/** ¿Pueden los usuarios hacerse administradores a sí mismos? Por defecto sí (web de demostración). */
export function selfAdminEnabled(env: Pick<Env, "SELF_ADMIN_ENABLED">): boolean {
  return env.SELF_ADMIN_ENABLED ?? true;
}

/** ¿Se publica la documentación de la API? Por defecto sí, salvo en producción. */
export function docsEnabled(env: Pick<Env, "NODE_ENV" | "API_DOCS_ENABLED">): boolean {
  return env.API_DOCS_ENABLED ?? env.NODE_ENV !== "production";
}

/** URL de la web para los enlaces de vuelta de Stripe. */
export function frontendUrl(env: Pick<Env, "FRONTEND_URL" | "CORS_ORIGINS">): string {
  const url = env.FRONTEND_URL ?? env.CORS_ORIGINS[0] ?? "http://localhost:3000";
  return url.replace(/\/+$/, "");
}
