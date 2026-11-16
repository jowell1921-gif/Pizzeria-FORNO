import { NextResponse, type NextRequest } from "next/server";

import { CONFIRM_PAGE_PATH, isOtpType } from "@/features/auth/confirm-link";
import { safeNextPath } from "@/features/auth/routes";
import { createClient } from "@/lib/supabase/server";

const ERROR_URL = "/acceso?error=confirm";

/**
 * Enlace de los correos de Supabase (confirmar registro y recuperar contraseña).
 *
 * El enlace del correo NO se gasta al abrirlo: aquí solo se redirige a una página con un botón
 * («/confirmar-correo»). Muchos clientes de correo y antivirus abren los enlaces por su cuenta para
 * analizarlos, y como el código de Supabase es de un solo uso, ese análisis lo consumía antes de que
 * la persona pulsara y a ella le salía «el enlace no es válido o ha caducado». Un robot no pulsa
 * botones, así que el código solo se gasta cuando lo hace la persona (ver `POST`).
 */
export function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  if (!tokenHash || !isOtpType(type)) return NextResponse.redirect(new URL(ERROR_URL, origin));

  const page = new URL(CONFIRM_PAGE_PATH, origin);
  page.searchParams.set("token_hash", tokenHash);
  page.searchParams.set("type", type);
  page.searchParams.set("next", safeNextPath(searchParams.get("next")));
  return NextResponse.redirect(page);
}

/**
 * Gasta el código del correo: el botón de «/confirmar-correo» envía aquí el formulario. A diferencia
 * del flujo por código, funciona aunque el enlace se abra en otro dispositivo o navegador. Responde
 * con 303 para que el navegador siga con una petición GET a la página de destino.
 */
export async function POST(request: NextRequest) {
  const { origin } = request.nextUrl;
  const form = await request.formData();
  const tokenHash = form.get("token_hash");
  const type = form.get("type");
  const next = safeNextPath(
    typeof form.get("next") === "string" ? (form.get("next") as string) : null,
  );

  const supabase = await createClient();
  if (
    supabase &&
    typeof tokenHash === "string" &&
    tokenHash &&
    typeof type === "string" &&
    isOtpType(type)
  ) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, origin), 303);
  }
  return NextResponse.redirect(new URL(ERROR_URL, origin), 303);
}
