/** Rutas que exigen sesión. La comprobación real de permisos la hace el backend. */
export const PROTECTED_PREFIXES = ["/cuenta", "/admin", "/kitchen"] as const;

export const LOGIN_PATH = "/acceso";
export const DEFAULT_AFTER_LOGIN = "/cuenta";

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Valida el destino al que volver tras iniciar sesión (parámetro `next`). Solo se admiten rutas
 * internas: así no se puede usar el formulario de acceso para redirigir a otra web (open redirect).
 */
export function safeNextPath(raw: string | null | undefined, fallback = DEFAULT_AFTER_LOGIN) {
  if (!raw) return fallback;
  const value = raw.trim();
  // Debe empezar por una sola «/»; «//host» y «/\host» son URLs externas para los navegadores.
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  // Sin caracteres de control ni barras invertidas, que algunos navegadores tratan como «/».
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return fallback;
  return value;
}

export function loginUrlFor(path: string): string {
  return `${LOGIN_PATH}?next=${encodeURIComponent(path)}`;
}
