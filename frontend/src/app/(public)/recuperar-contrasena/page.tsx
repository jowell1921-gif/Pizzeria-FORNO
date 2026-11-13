import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/features/auth/auth-shell";
import { ForgotPasswordForm } from "@/features/auth/forgot-password-form";
import { NotConfiguredNotice } from "@/features/auth/not-configured-notice";

export const metadata: Metadata = {
  title: "Recuperar contraseña",
  robots: { index: false },
};

/** Solicitud del correo de recuperación de contraseña (lo envía Supabase). */
export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Recuperar contraseña"
      description="Te enviaremos un enlace para crear una contraseña nueva."
    >
      <NotConfiguredNotice />
      <ForgotPasswordForm />
      <p className="border-border border-t pt-6 text-center text-sm">
        <Link
          href="/acceso"
          className="text-tomato-strong font-semibold underline underline-offset-4"
        >
          Volver a iniciar sesión
        </Link>
      </p>
    </AuthShell>
  );
}
