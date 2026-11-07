"use client";

import { UserRound } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { useProfile } from "@/features/account/profile-context";
import { cn } from "@/lib/utils";

interface AuthMenuProps {
  className?: string;
  onNavigate?: () => void;
}

/**
 * Botón de la cabecera: «Acceder» sin sesión, y con sesión el nombre de usuario (o «Mi cuenta» hasta
 * que lo elige). El nombre de usuario tiene un máximo de 12 caracteres para que siempre quepa.
 * Solo adapta la interfaz: no es una comprobación de seguridad.
 */
export function AuthMenu({ className, onNavigate }: AuthMenuProps) {
  const { auth, profile } = useProfile();
  const signedIn = auth.status === "authenticated";
  const label = !signedIn ? "Acceder" : (profile?.username ?? "Mi cuenta");

  return (
    <Link
      href={signedIn ? "/cuenta" : "/acceso"}
      onClick={onNavigate}
      transitionTypes={["nav-forward"]}
      aria-label={signedIn && profile?.username ? `Mi cuenta (${profile.username})` : undefined}
      className={cn(buttonVariants({ variant: "outline" }), "max-w-[11rem]", className)}
    >
      <UserRound aria-hidden className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}
