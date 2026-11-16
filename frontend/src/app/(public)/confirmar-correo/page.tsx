import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { AuthShell } from "@/features/auth/auth-shell";
import { isOtpType } from "@/features/auth/confirm-link";
import { safeNextPath } from "@/features/auth/routes";

export const metadata: Metadata = {
  title: "Confirmar",
  robots: { index: false },
};

/** Texto de la página según para qué es el enlace del correo. */
function copyFor(type: string) {
  if (type === "recovery") {
    return {
      title: "Restablecer contraseña",
      description: "Pulsa el botón para continuar y elegir tu nueva contraseña.",
      button: "Continuar",
    };
  }
  return {
    title: "Confirma tu correo",
    description: "Pulsa el botón para activar tu cuenta y empezar a pedir.",
    button: "Confirmar mi correo",
  };
}

async function ConfirmContent({
  searchParams,
}: Pick<PageProps<"/confirmar-correo">, "searchParams">) {
  const params = await searchParams;
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const tokenHash = first(params.token_hash);
  const type = first(params.type);
  if (!tokenHash || !isOtpType(type)) redirect("/acceso?error=confirm");

  const copy = copyFor(type);
  return (
    <AuthShell title={copy.title} description={copy.description}>
      {/* POST normal (sin JavaScript): el código del correo solo se gasta cuando la persona pulsa. */}
      <form method="post" action="/auth/confirm" className="space-y-4">
        <input type="hidden" name="token_hash" value={tokenHash} />
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="next" value={safeNextPath(first(params.next))} />
        <Button type="submit" size="lg" className="w-full">
          {copy.button}
        </Button>
      </form>
    </AuthShell>
  );
}

/**
 * Paso intermedio de los enlaces de correo de Supabase. Existe para que ningún robot (analizador de
 * enlaces del correo, antivirus, vista previa) gaste el código de un solo uso: ver `/auth/confirm`.
 */
export default function ConfirmEmailPage({ searchParams }: PageProps<"/confirmar-correo">) {
  return (
    <Suspense fallback={null}>
      <ConfirmContent searchParams={searchParams} />
    </Suspense>
  );
}
