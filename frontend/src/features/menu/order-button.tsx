"use client";

import { ShoppingBag } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { useOptionalProfile } from "@/features/account/profile-context";
import { cn } from "@/lib/utils";

/**
 * «Pedir ahora» de las ventanas de detalle. Solo los clientes con cuenta pueden pedir: sin sesión
 * lleva a acceder. El carrito y el pedido real llegan en la fase de pedidos, mientras tanto con
 * sesión iniciada se informa de que aún no está disponible (no se simula un pedido).
 */
export function OrderButton({ disabled = false }: { disabled?: boolean }) {
  const profile = useOptionalProfile();
  const signedIn = profile?.auth.status === "authenticated";
  const className = cn(buttonVariants({ size: "lg" }), "w-full tracking-wide uppercase");

  if (disabled) {
    return (
      <button type="button" disabled className={className}>
        No disponible
      </button>
    );
  }

  if (signedIn) {
    return (
      <div className="space-y-2">
        <button type="button" aria-disabled="true" className={cn(className, "opacity-60")}>
          <ShoppingBag aria-hidden />
          Pedir ahora
        </button>
        <p className="text-muted-foreground text-center text-xs">
          Los pedidos online estarán disponibles muy pronto (demostración).
        </p>
      </div>
    );
  }

  return (
    <Link href="/acceso?next=/carta" className={className}>
      <ShoppingBag aria-hidden />
      Pedir ahora
    </Link>
  );
}
