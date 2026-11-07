"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

import { Field, FormError, FormSuccess } from "./form-parts";
import { authErrorMessage, NOT_CONFIGURED_ERROR } from "./messages";
import { safeNextPath } from "./routes";
import { registerSchema, type RegisterValues } from "./schemas";

export function RegisterForm({ next }: { next: string }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      confirmPassword: "",
      acceptPrivacy: false,
    },
  });

  async function onSubmit(values: RegisterValues) {
    setServerError(null);
    const supabase = createClient();
    if (!supabase) {
      setServerError(NOT_CONFIGURED_ERROR);
      return;
    }

    const destination = safeNextPath(next);
    const { data, error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        data: { full_name: values.fullName },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(destination)}`,
      },
    });
    if (error) {
      setServerError(authErrorMessage(error));
      return;
    }

    // Con la confirmación de correo activada no hay sesión hasta que se pulsa el enlace.
    if (data.session) {
      router.replace(destination);
      router.refresh();
      return;
    }
    setPendingConfirmation(values.email);
  }

  if (pendingConfirmation) {
    return (
      <FormSuccess>
        <p className="font-semibold">Revisa tu correo</p>
        <p className="mt-1">
          Hemos enviado un enlace de confirmación a <strong>{pendingConfirmation}</strong>. Púlsalo
          para activar tu cuenta. Si no lo ves, mira en la carpeta de spam.
        </p>
      </FormSuccess>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      <Field
        id="register-name"
        label="Nombre completo"
        autoComplete="name"
        error={errors.fullName?.message}
        {...register("fullName")}
      />
      <Field
        id="register-email"
        label="Correo electrónico"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register("email")}
      />
      <Field
        id="register-password"
        label="Contraseña"
        type="password"
        autoComplete="new-password"
        hint="Mínimo 8 caracteres, con letras y números."
        error={errors.password?.message}
        {...register("password")}
      />
      <Field
        id="register-confirm"
        label="Repite la contraseña"
        type="password"
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        {...register("confirmPassword")}
      />

      <div className="space-y-2">
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="accent-tomato-strong mt-0.5 size-5 shrink-0"
            aria-invalid={errors.acceptPrivacy ? true : undefined}
            aria-describedby={errors.acceptPrivacy ? "register-privacy-error" : undefined}
            {...register("acceptPrivacy")}
          />
          <span>
            He leído y acepto la{" "}
            <Link
              href="/legal/privacidad"
              className="text-tomato-strong font-semibold underline underline-offset-4"
            >
              política de privacidad
            </Link>
            .
          </span>
        </label>
        {errors.acceptPrivacy ? (
          <p id="register-privacy-error" className="text-destructive text-sm font-medium">
            {errors.acceptPrivacy.message}
          </p>
        ) : null}
      </div>

      <FormError>{serverError}</FormError>
      <Button
        type="submit"
        size="lg"
        className="w-full tracking-wide uppercase"
        disabled={isSubmitting}
      >
        {isSubmitting ? "Creando cuenta…" : "Crear cuenta"}
      </Button>
    </form>
  );
}
