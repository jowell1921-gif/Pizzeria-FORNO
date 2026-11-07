export interface SupabaseConfig {
  url: string;
  publishableKey: string;
}

/**
 * Configuración pública de Supabase. Las variables NEXT_PUBLIC_* deben referenciarse de forma
 * literal para que Next las incluya en el código del navegador.
 *
 * La clave «publishable» (sb_publishable_...) es pública por diseño; la clave secreta
 * (sb_secret_...) y la antigua service_role NUNCA deben aparecer en el frontend.
 *
 * Devuelve null si no está configurado: la web pública sigue funcionando y las páginas de acceso
 * muestran un aviso en lugar de fallar.
 */
export function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) return null;
  try {
    new URL(url);
  } catch {
    return null;
  }
  return { url, publishableKey };
}

export function isAuthConfigured(): boolean {
  return getSupabaseConfig() !== null;
}
