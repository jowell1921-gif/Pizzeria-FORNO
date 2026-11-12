import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AuthShell } from "@/features/auth/auth-shell";
import { FormError } from "@/features/auth/form-parts";
import { GoogleButton } from "@/features/auth/google-button";
import { LoginForm } from "@/features/auth/login-form";
import { NotConfiguredNotice } from "@/features/auth/not-configured-notice";
import { safeNextPath } from "@/features/auth/routes";

export const metadata: Metadata = {
  title: "Acceder",
  description: "Inicia sesión en FORNEA para hacer pedidos y acumular puntos.",
  robots: { index: false },
};

const ERROR_MESSAGES: Record<string, string> = {
  callback:
    "No hemos podido completar el acceso. El enlace puede haber caducado: inténtalo de nuevo.",
  confirm: "El enlace de confirmación no es válido o ha caducado. Solicita uno nuevo.",
};

async function LoginContent({ searchParams }: Pick<PageProps<"/acceso">, "searchParams">) {
  const params = await searchParams;
  const nextParam = Array.isArray(params.next) ? params.next[0] : params.next;
  const errorParam = Array.isArray(params.error) ? params.error[0] : params.error;
  const next = safeNextPath(nextParam);
  const registerHref = nextParam ? `/registro?next=${encodeURIComponent(next)}` : "/registro";

  return (
    <AuthShell
      title="Acceder"
      description="Entra para hacer pedidos, ver tu historial y sumar puntos."
    >
      <NotConfiguredNotice />
      <FormError>{errorParam ? ERROR_MESSAGES[errorParam] : null}</FormError>
      <GoogleButton next={next} />
      <div className="text-muted-foreground flex items-center gap-3 text-sm" aria-hidden>
        <span className="bg-border h-px flex-1" />o con tu correo
        <span className="bg-border h-px flex-1" />
      </div>
      <LoginForm next={next} />
      <p className="border-border border-t pt-6 text-center text-sm">
        ¿Aún no tienes cuenta?{" "}
        <Link
          href={registerHref}
          className="text-tomato-strong font-semibold underline underline-offset-4"
        >
          Crear cuenta
        </Link>
      </p>
    </AuthShell>
  );
}

export default function LoginPage({ searchParams }: PageProps<"/acceso">) {
  return (
    <Suspense fallback={null}>
      <LoginContent searchParams={searchParams} />
    </Suspense>
  );
}
