import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseConfig } from "./config";

/** Cliente de Supabase para componentes de cliente. Devuelve null si no está configurado. */
export function createClient() {
  const config = getSupabaseConfig();
  if (!config) return null;
  return createBrowserClient(config.url, config.publishableKey);
}
