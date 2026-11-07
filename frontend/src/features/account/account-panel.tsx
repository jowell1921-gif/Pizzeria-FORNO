"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { FormError, FormSuccess } from "@/features/auth/form-parts";
import { ApiError } from "@/lib/api";

import { AccountDashboard } from "./account-dashboard";
import { useProfile } from "./profile-context";
import { ProfileDataForm } from "./profile-data-form";
import { SignOutButton } from "./sign-out-button";

function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0)
      return "No se pudo conectar con el servidor. Comprueba que el backend está en marcha.";
    if (error.status === 401) return "Tu sesión no es válida. Cierra sesión y vuelve a entrar.";
    if (error.status === 403) return "Esta cuenta está desactivada. Contacta con el local.";
    if (error.status === 409) {
      return "Este correo ya está asociado a otra cuenta de FORNO. Contacta con el local para recuperarla.";
    }
  }
  return "No hemos podido cargar tu perfil. Inténtalo de nuevo.";
}

/**
 * Contenido de «Mi cuenta». Un cliente nuevo (sin nombre de usuario ni teléfono) ve primero el
 * formulario «Completa tus datos»; al guardarlo vuelve a la página principal. A partir de entonces,
 * «Mi cuenta» es un panel con sus datos, puntos, pedidos y direcciones.
 */
export function AccountPanel() {
  const router = useRouter();
  const { auth, token, profileStatus, profile, profileError, setProfile } = useProfile();
  const [justCompleted, setJustCompleted] = useState(false);

  if (auth.status === "loading") {
    return <p className="text-muted-foreground text-sm">Cargando tu cuenta…</p>;
  }

  if (auth.status === "anonymous") {
    return (
      <div className="space-y-4">
        <p>Necesitas iniciar sesión para ver tu cuenta.</p>
        <Link href="/acceso?next=/cuenta" className={buttonVariants({ size: "lg" })}>
          Iniciar sesión
        </Link>
      </div>
    );
  }

  if (profileStatus === "error") return <FormError>{describeError(profileError)}</FormError>;
  if (profileStatus !== "ready" || !profile || !token) {
    return <p className="text-muted-foreground text-sm">Cargando tu perfil…</p>;
  }

  if (justCompleted) {
    return (
      <FormSuccess>
        <p className="font-semibold">¡Datos guardados!</p>
        <p className="mt-1">Te llevamos a la página principal…</p>
      </FormSuccess>
    );
  }

  if (!profile.profileComplete) {
    return (
      <div className="mx-auto w-full max-w-xl space-y-6">
        <div className="border-border bg-cream-soft rounded-2xl border p-5">
          <h2 className="text-2xl leading-none font-bold">Completa tus datos</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            Para poder hacer pedidos necesitamos un nombre de usuario y un teléfono de contacto.
          </p>
        </div>
        <div className="border-border bg-card rounded-2xl border p-6 shadow-sm sm:p-8">
          <ProfileDataForm
            profile={profile}
            token={token}
            mode="onboarding"
            onSaved={(saved) => {
              setProfile(saved);
              setJustCompleted(true);
              router.push("/");
              router.refresh();
            }}
          />
        </div>
        <div className="flex justify-center">
          <SignOutButton />
        </div>
      </div>
    );
  }

  return <AccountDashboard />;
}
