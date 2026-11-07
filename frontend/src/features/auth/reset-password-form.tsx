"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button, buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

import { Field, FormError, FormSuccess } from "./form-parts";
import { authErrorMessage, NOT_CONFIGURED_ERROR } from "./messages";
import { resetPasswordSchema, type ResetPasswordValues } from "./schemas";
import { useAuthState } from "./use-auth-state";

/** Formulario para elegir una nueva contraseña. Exige la sesión que crea el enlace del correo. */
export function ResetPasswordForm() {
  const router = useRouter();
  const auth = useAuthState();
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  async function onSubmit({ password }: ResetPasswordValues) {
    setServerError(null);
    const supabase = createClient();
    if (!supabase) {
      setServerError(NOT_CONFIGURED_ERROR);
      return;
    }
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setServerError(authErrorMessage(error));
      return;
    }
    setDone(true);
    router.refresh();
  }

  if (auth.status === "loading") {
    return <p className="text-muted-foreground text-sm">Comprobando el enlace…</p>;
  }

  if (auth.status === "anonymous") {
    return (
      <div className="space-y-4">
        <FormError>El enlace no es válido o ha caducado.</FormError>
        <Link href="/recuperar-contrasena" className={buttonVariants({ size: "lg" }) + " w-full"}>
          Solicitar un enlace nuevo
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-4">
        <FormSuccess>
          <p className="font-semibold">Contraseña actualizada</p>
          <p className="mt-1">Ya puedes usar tu nueva contraseña.</p>
        </FormSuccess>
        <Link href="/cuenta" className={buttonVariants({ size: "lg" }) + " w-full"}>
          Ir a mi cuenta
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      <Field
        id="reset-password"
        label="Nueva contraseña"
        type="password"
        autoComplete="new-password"
        hint="Mínimo 8 caracteres, con letras y números."
        error={errors.password?.message}
        {...register("password")}
      />
      <Field
        id="reset-confirm"
        label="Repite la nueva contraseña"
        type="password"
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        {...register("confirmPassword")}
      />
      <FormError>{serverError}</FormError>
      <Button
        type="submit"
        size="lg"
        className="w-full tracking-wide uppercase"
        disabled={isSubmitting}
      >
        {isSubmitting ? "Guardando…" : "Guardar contraseña"}
      </Button>
    </form>
  );
}
