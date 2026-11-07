import type { Metadata } from "next";

import { AuthShell } from "@/features/auth/auth-shell";
import { NotConfiguredNotice } from "@/features/auth/not-configured-notice";
import { ResetPasswordForm } from "@/features/auth/reset-password-form";

export const metadata: Metadata = {
  title: "Nueva contraseña",
  robots: { index: false },
};

export default function ResetPasswordPage() {
  return (
    <AuthShell
      title="Nueva contraseña"
      description="Elige la contraseña con la que vas a entrar a FORNO."
    >
      <NotConfiguredNotice />
      <ResetPasswordForm />
    </AuthShell>
  );
}
