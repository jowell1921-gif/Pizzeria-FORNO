import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseConfig } from "./config";

/**
 * Refresca la sesión de Supabase en cada petición a una ruta protegida y dice si hay un usuario
 * autenticado. Se usa desde `src/proxy.ts`.
 *
 * Se verifica con `getClaims()`, que comprueba la firma del token; nunca se confía en
 * `getSession()` en código de servidor, porque lee la cookie sin revalidarla.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const config = getSupabaseConfig();
  if (!config) return { response, authenticated: false };

  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  return { response, authenticated: Boolean(data?.claims?.sub) };
}
