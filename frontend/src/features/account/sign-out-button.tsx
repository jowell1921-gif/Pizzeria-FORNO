"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

interface SignOutButtonProps {
  className?: string;
  size?: "default" | "lg";
}

/** Cierra la sesión y vuelve a la página principal. */
export function SignOutButton({ className, size = "default" }: SignOutButtonProps) {
  const router = useRouter();

  async function signOut() {
    await createClient()?.auth.signOut();
    router.replace("/");
    router.refresh();
  }

  return (
    <Button type="button" variant="outline" size={size} className={className} onClick={signOut}>
      <LogOut aria-hidden />
      Cerrar sesión
    </Button>
  );
}
