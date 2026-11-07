import { isAuthConfigured } from "@/lib/supabase/config";

/**
 * Aviso para entornos sin claves de Supabase (por ejemplo, un clon recién descargado). La web
 * pública funciona igual; solo se desactiva el acceso de usuarios.
 */
export function NotConfiguredNotice() {
  if (isAuthConfigured()) return null;
  return (
    <div
      role="note"
      data-testid="auth-not-configured"
      className="border-border bg-cream-soft rounded-lg border p-4 text-sm"
    >
      <p className="font-semibold">Acceso de usuarios no configurado</p>
      <p className="text-muted-foreground mt-1">
        Faltan las variables <code className="break-all">NEXT_PUBLIC_SUPABASE_URL</code> y{" "}
        <code className="break-all">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>. Consulta{" "}
        <code className="break-all">docs/security/supabase-auth.md</code>.
      </p>
    </div>
  );
}
