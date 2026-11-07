"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Field, FormError, FormSuccess } from "@/features/auth/form-parts";
import { authErrorMessage, NOT_CONFIGURED_ERROR } from "@/features/auth/messages";
import { resetPasswordSchema, type ResetPasswordValues } from "@/features/auth/schemas";
import { createClient } from "@/lib/supabase/client";

import { CardSection } from "./card-section";

/** Cambio de contraseña y cierre de sesión. */
export function SecurityCard() {
  const [open, setOpen] = useState(false);
  const [changed, setChanged] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
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
    reset();
    setOpen(false);
    setChanged(true);
  }

  return (
    <CardSection id="security-title" title="Seguridad" icon={ShieldCheck}>
      {changed ? <FormSuccess>Contraseña actualizada.</FormSuccess> : null}

      {open ? (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <Field
            id="security-password"
            label="Nueva contraseña"
            type="password"
            autoComplete="new-password"
            hint="Mínimo 8 caracteres, con letras y números."
            error={errors.password?.message}
            {...register("password")}
          />
          <Field
            id="security-confirm"
            label="Repite la nueva contraseña"
            type="password"
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            {...register("confirmPassword")}
          />
          <FormError>{serverError}</FormError>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Guardando…" : "Guardar contraseña"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                reset();
                setOpen(false);
              }}
            >
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setChanged(false);
              setOpen(true);
            }}
          >
            Cambiar contraseña
          </Button>
        </div>
      )}
    </CardSection>
  );
}
