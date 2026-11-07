import { NextResponse, type NextRequest } from "next/server";

import { loginUrlFor, isProtectedPath } from "@/features/auth/routes";
import { updateSession } from "@/lib/supabase/update-session";

/**
 * Refresca la sesión y redirige a /acceso a quien intente entrar sin sesión en una zona privada.
 * Es una mejora de experiencia: la seguridad real está en el backend, que verifica el token y los
 * permisos en cada petición.
 */
export async function proxy(request: NextRequest) {
  const { response, authenticated } = await updateSession(request);

  const { pathname, search } = request.nextUrl;
  if (!authenticated && isProtectedPath(pathname)) {
    const redirect = NextResponse.redirect(
      new URL(loginUrlFor(`${pathname}${search}`), request.url),
    );
    // Conserva las cookies que haya podido actualizar o borrar la comprobación de la sesión.
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }
  return response;
}

// Solo se ejecuta en las zonas privadas: las páginas públicas no pagan este coste.
export const config = {
  matcher: ["/cuenta/:path*", "/admin/:path*", "/kitchen/:path*"],
};
