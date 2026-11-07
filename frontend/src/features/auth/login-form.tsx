"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

import { Field, FormError } from "./form-parts";
import { authErrorMessage, NOT_CONFIGURED_ERROR } from "./messages";
import { safeNextPath } from "./routes";
import { loginSchema, type LoginValues } from "./schemas";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginValues) {
    setServerError(null);
    const supabase = createClient();
    if (!supabase) {
      setServerError(NOT_CONFIGURED_ERROR);
      return;
    }
    const { error } = await supabase.auth.signInWithPassword(values);
    if (error) {
      setServerError(authErrorMessage(error));
      return;
    }
    router.replace(safeNextPath(next));
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      <Field
        id="login-email"
        label="Correo electrónico"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register("email")}
      />
      <Field
        id="login-password"
        label="Contraseña"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register("password")}
      />
      <FormError>{serverError}</FormError>
      <Button
        type="submit"
        size="lg"
        className="w-full tracking-wide uppercase"
        disabled={isSubmitting}
      >
        {isSubmitting ? "Entrando…" : "Iniciar sesión"}
      </Button>
      <p className="text-center text-sm">
        <Link
          href="/recuperar-contrasena"
          className="text-tomato-strong font-semibold underline underline-offset-4"
        >
          ¿Has olvidado tu contraseña?
        </Link>
      </p>
    </form>
  );
}
