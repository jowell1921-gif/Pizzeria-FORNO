"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

import { Field, FormError, FormSuccess } from "./form-parts";
import { authErrorMessage, NETWORK_ERROR, NOT_CONFIGURED_ERROR } from "./messages";
import { forgotPasswordSchema, type ForgotPasswordValues } from "./schemas";

export function ForgotPasswordForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit({ email }: ForgotPasswordValues) {
    setServerError(null);
    const supabase = createClient();
    if (!supabase) {
      setServerError(NOT_CONFIGURED_ERROR);
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/restablecer-contrasena`,
    });

    // Se muestra siempre la misma confirmación, exista o no la cuenta, para que nadie pueda
    // averiguar qué correos están registrados. Solo se informa de fallos que no revelan nada.
    const message = error ? authErrorMessage(error) : null;
    if (message && (error?.status === 429 || message === NETWORK_ERROR)) {
      setServerError(message);
      return;
    }
    setSentTo(email);
  }

  if (sentTo) {
    return (
      <FormSuccess>
        <p className="font-semibold">Revisa tu correo</p>
        <p className="mt-1">
          Si <strong>{sentTo}</strong> tiene una cuenta en FORNO, recibirás en unos minutos un
          enlace para crear una nueva contraseña.
        </p>
      </FormSuccess>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      <Field
        id="forgot-email"
        label="Correo electrónico"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register("email")}
      />
      <FormError>{serverError}</FormError>
      <Button
        type="submit"
        size="lg"
        className="w-full tracking-wide uppercase"
        disabled={isSubmitting}
      >
        {isSubmitting ? "Enviando…" : "Enviar enlace"}
      </Button>
    </form>
  );
}
