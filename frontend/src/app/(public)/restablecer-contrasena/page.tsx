import type { Metadata } from "next";

import { AuthShell } from "@/features/auth/auth-shell";
import { NotConfiguredNotice } from "@/features/auth/not-configured-notice";
import { ResetPasswordForm } from "@/features/auth/reset-password-form";

export const metadata: Metadata = {
  title: "Nueva contraseña",
  robots: { index: false },
};

/** Elección de la nueva contraseña tras pulsar el enlace del correo de recuperación. */
export default function ResetPasswordPage() {
  return (
    <AuthShell
      title="Nueva contraseña"
      description="Elige la contraseña con la que vas a entrar a FORNEA."
    >
      <NotConfiguredNotice />
      <ResetPasswordForm />
    </AuthShell>
  );
}
