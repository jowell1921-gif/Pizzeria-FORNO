import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AuthShell } from "@/features/auth/auth-shell";
import { GoogleButton } from "@/features/auth/google-button";
import { NotConfiguredNotice } from "@/features/auth/not-configured-notice";
import { RegisterForm } from "@/features/auth/register-form";
import { safeNextPath } from "@/features/auth/routes";

export const metadata: Metadata = {
  title: "Crear cuenta",
  description: "Crea tu cuenta en FORNO para hacer pedidos y acumular puntos con FORNO CLUB.",
  robots: { index: false },
};

async function RegisterContent({ searchParams }: Pick<PageProps<"/registro">, "searchParams">) {
  const params = await searchParams;
  const nextParam = Array.isArray(params.next) ? params.next[0] : params.next;
  const next = safeNextPath(nextParam);
  const loginHref = nextParam ? `/acceso?next=${encodeURIComponent(next)}` : "/acceso";

  return (
    <AuthShell
      title="Crear cuenta"
      description="Necesitas una cuenta para hacer pedidos y sumar puntos."
    >
      <NotConfiguredNotice />
      <GoogleButton next={next} />
      <div className="text-muted-foreground flex items-center gap-3 text-sm" aria-hidden>
        <span className="bg-border h-px flex-1" />o con tu correo
        <span className="bg-border h-px flex-1" />
      </div>
      <RegisterForm next={next} />
      <p className="border-border border-t pt-6 text-center text-sm">
        ¿Ya tienes cuenta?{" "}
        <Link
          href={loginHref}
          className="text-tomato-strong font-semibold underline underline-offset-4"
        >
          Iniciar sesión
        </Link>
      </p>
    </AuthShell>
  );
}

export default function RegisterPage({ searchParams }: PageProps<"/registro">) {
  return (
    <Suspense fallback={null}>
      <RegisterContent searchParams={searchParams} />
    </Suspense>
  );
}
