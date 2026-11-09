"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ApiError, apiRequest } from "@/lib/api";

import { profileSchema } from "./profile";
import { useProfile } from "./profile-context";

const OFFER_KEY = "forno-admin-offer-v1";

/** Pide al servidor (que decide si está permitido) hacerse o dejar de ser administrador. */
function changeAdminRole(token: string, admin: boolean) {
  return apiRequest("/me/admin-role", {
    token,
    method: admin ? "PUT" : "DELETE",
    schema: profileSchema,
  });
}

/**
 * Hacerse o dejar de ser administrador. Devuelve el estado de la petición y la acción, que
 * actualiza el perfil compartido (la cabecera y el menú cambian al instante).
 */
export function useAdminRole() {
  const { token, profile, setProfile } = useProfile();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(admin: boolean): Promise<boolean> {
    if (!token) return false;
    setPending(true);
    setError(null);
    try {
      setProfile(await changeAdminRole(token, admin));
      return true;
    } catch (failure) {
      setError(
        failure instanceof ApiError && failure.code === "SELF_ADMIN_DISABLED"
          ? "Esta opción no está disponible en este entorno."
          : "No se ha podido cambiar el rol. Inténtalo de nuevo.",
      );
      return false;
    } finally {
      setPending(false);
    }
  }

  return {
    available: profile?.selfAdminAvailable ?? false,
    isAdmin: profile?.roles.includes("ADMIN") ?? false,
    pending,
    error,
    change,
  };
}

/** Botón de «Mi cuenta»: «Hazte administrador» o «Dejar de ser administrador». */
export function AdminRoleButton({ className }: { className?: string }) {
  const { available, isAdmin, pending, error, change } = useAdminRole();
  if (!available) return null;
  return (
    <div className="flex flex-col gap-1 sm:items-end">
      <Button
        type="button"
        variant="outline"
        size="lg"
        disabled={pending}
        onClick={() => void change(!isAdmin)}
        className={className}
      >
        {pending ? "Un momento…" : isAdmin ? "Dejar de ser administrador" : "Hazte administrador"}
      </Button>
      {error ? (
        <p role="alert" className="text-sm font-medium text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Ventana que se muestra una vez a quien inicia sesión sin ningún rol, para ofrecerle ver el panel
 * del personal. Elija lo que elija, se recuerda en este navegador (no vuelve a salir) y se muestra
 * la pantalla principal.
 */
export function AdminOfferDialog() {
  const { profile, auth } = useProfile();
  const { pending, error, change } = useAdminRole();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const userId = profile?.id;
  const eligible =
    auth.status === "authenticated" &&
    profile?.selfAdminAvailable === true &&
    profile.profileComplete &&
    profile.roles.length === 0;

  useEffect(() => {
    if (!eligible || !userId) return;
    const answered = localStorage.getItem(`${OFFER_KEY}:${userId}`) !== null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lee una preferencia del navegador
    if (!answered) setOpen(true);
  }, [eligible, userId]);

  function finish(answer: "yes" | "no") {
    if (userId) localStorage.setItem(`${OFFER_KEY}:${userId}`, answer);
    setOpen(false);
    router.push("/");
  }

  async function accept() {
    if (await change(true)) finish("yes");
  }

  if (!open) return null;

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) finish("no");
      }}
    >
      <DialogContent className="p-6 sm:p-8">
        <div className="space-y-4">
          <DialogTitle className="pr-10">¿Quieres ver el panel del personal?</DialogTitle>
          <DialogDescription className="text-base">
            FORNO tiene dos caras: la <strong>web para los clientes</strong> (la que ves ahora, con
            la carta y tus pedidos) y el <strong>panel del personal</strong>, que es la parte
            privada con la que el restaurante gestiona su día a día.
          </DialogDescription>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>
              Si <strong>aceptas</strong>, tu cuenta será de administrador y podrás ver todo el
              panel: pedidos, cocina, carta, promociones, FORNO CLUB, ajustes del local y auditoría.
              También podrás cambiarlos.
            </li>
            <li>
              Si eliges <strong>solo como cliente</strong>, seguirás como cliente normal: solo verás
              tus pedidos y tus puntos.
            </li>
            <li>
              Es solo para esta demostración. Puedes cambiar de opinión cuando quieras desde «Mi
              cuenta».
            </li>
          </ul>
          {error ? (
            <p role="alert" className="text-destructive text-sm font-medium">
              {error}
            </p>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => finish("no")}
              className="h-auto min-h-11 w-full px-3 py-2 whitespace-normal"
            >
              Solo como cliente
            </Button>
            <Button
              type="button"
              size="lg"
              disabled={pending}
              onClick={() => void accept()}
              className="h-auto min-h-11 w-full px-3 py-2 tracking-wide whitespace-normal uppercase sm:order-last"
            >
              {pending ? "Un momento…" : "Sí, quiero ser administrador"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
