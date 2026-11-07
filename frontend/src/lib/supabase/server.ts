import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabaseConfig } from "./config";

/**
 * Cliente de Supabase para route handlers y server actions. Lee y escribe la sesión en las cookies.
 * Devuelve null si no está configurado. Crea uno nuevo en cada petición (es barato).
 */
export async function createClient() {
  const config = getSupabaseConfig();
  if (!config) return null;

  const cookieStore = await cookies();
  return createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // En un Server Component las cookies no se pueden escribir. No pasa nada: el proxy
          // refresca la sesión en las rutas protegidas.
        }
      },
    },
  });
}
