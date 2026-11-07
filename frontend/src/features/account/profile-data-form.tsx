"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Field, FormError } from "@/features/auth/form-parts";
import { ApiError } from "@/lib/api";

import {
  profileFormSchema,
  saveProfile,
  USERNAME_MAX,
  USERNAME_MIN,
  type Profile,
  type ProfileFormValues,
} from "./profile";

interface ProfileDataFormProps {
  profile: Profile;
  token: string;
  /** `onboarding`: primer alta de datos. `edit`: modificación desde «Mi cuenta». */
  mode: "onboarding" | "edit";
  onSaved: (profile: Profile) => void;
  onCancel?: () => void;
}

/** Formulario de datos personales. Nombre de usuario y teléfono son obligatorios. */
export function ProfileDataForm({ profile, token, mode, onSaved, onCancel }: ProfileDataFormProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      fullName: profile.fullName,
      username: profile.username ?? "",
      phone: profile.phone ?? "",
      marketingConsent: profile.marketingConsent,
    },
  });

  const usernameLength = useWatch({ control, name: "username" })?.length ?? 0;

  async function onSubmit(values: ProfileFormValues) {
    setServerError(null);
    try {
      onSaved(await saveProfile(token, values));
    } catch (error) {
      setServerError(
        error instanceof ApiError && error.status === 0
          ? "No se pudo conectar con el servidor. Inténtalo de nuevo."
          : "No hemos podido guardar los cambios. Revisa los datos e inténtalo de nuevo.",
      );
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      <Field
        id="profile-name"
        label="Nombre completo"
        autoComplete="name"
        error={errors.fullName?.message}
        {...register("fullName")}
      />
      <Field
        id="profile-username"
        label="Nombre de usuario"
        autoComplete="nickname"
        maxLength={USERNAME_MAX}
        hint={`De ${USERNAME_MIN} a ${USERNAME_MAX} caracteres, sin espacios. Es el nombre que verás en el botón «Mi cuenta» (${usernameLength}/${USERNAME_MAX}).`}
        error={errors.username?.message}
        {...register("username")}
      />
      <Field
        id="profile-email"
        label="Correo electrónico"
        type="email"
        value={profile.email}
        readOnly
        hint="El correo es el de tu cuenta de acceso y no se puede cambiar aquí."
      />
      <Field
        id="profile-phone"
        label="Teléfono"
        type="tel"
        autoComplete="tel"
        hint="Lo usamos para avisarte de tus pedidos."
        error={errors.phone?.message}
        {...register("phone")}
      />

      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="accent-tomato-strong mt-0.5 size-5 shrink-0"
          {...register("marketingConsent")}
        />
        <span>
          Quiero recibir ofertas y novedades de FORNO por correo (opcional). Puedes retirar el
          consentimiento cuando quieras.
        </span>
      </label>

      <FormError>{serverError}</FormError>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting ? "Guardando…" : "Guardar cambios"}
        </Button>
        {mode === "edit" && onCancel ? (
          <Button type="button" variant="outline" size="lg" onClick={onCancel}>
            Cancelar
          </Button>
        ) : null}
      </div>
    </form>
  );
}
