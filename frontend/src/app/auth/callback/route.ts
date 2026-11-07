import { NextResponse, type NextRequest } from "next/server";

import { safeNextPath } from "@/features/auth/routes";
import { createClient } from "@/lib/supabase/server";

/**
 * Destino al que Supabase devuelve al usuario tras iniciar sesión con Google o pulsar el enlace de
 * confirmación/recuperación (flujo PKCE): intercambia el código por una sesión y redirige.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  // Solo se redirige a rutas internas (evita redirecciones abiertas).
  const next = safeNextPath(searchParams.get("next"));

  const supabase = await createClient();
  if (supabase && code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }
  return NextResponse.redirect(new URL("/acceso?error=callback", origin));
}
