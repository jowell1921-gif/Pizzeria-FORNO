"use client";

import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { useOptionalProfile } from "@/features/account/profile-context";
import { cn } from "@/lib/utils";

const FORWARD = ["nav-forward"];

/**
 * Botón principal junto al carrito: «Panel del personal» para quien tiene acceso al panel (o a la
 * cocina) y «Pedir ahora» para los demás. Solo adapta la interfaz: el acceso real lo decide el servidor.
 */
export function HeaderAction() {
  const permissions = useOptionalProfile()?.profile?.permissions ?? [];
  const href = permissions.includes("orders:read:all")
    ? "/admin"
    : permissions.includes("kitchen:orders:read")
      ? "/kitchen"
      : null;

  return (
    <Link
      href={href ?? "/carta"}
      transitionTypes={FORWARD}
      className={cn(
        buttonVariants({ size: "default" }),
        "tracking-wide uppercase max-[419px]:hidden",
      )}
    >
      {href ? "Panel del personal" : "Pedir ahora"}
    </Link>
  );
}
