"use client";

import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

export type AuthState =
  | { status: "loading"; session: null }
  | { status: "anonymous"; session: null }
  | { status: "authenticated"; session: Session };

/**
 * Estado de la sesión en el navegador, solo para adaptar la interfaz (mostrar «Acceder» o «Mi
 * cuenta»). No es una comprobación de seguridad: el backend verifica el token en cada petición.
 */
export function useAuthState(): AuthState {
  const [state, setState] = useState<AuthState>(() =>
    createClient() ? { status: "loading", session: null } : { status: "anonymous", session: null },
  );

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;

    // Se emite enseguida con la sesión actual y después en cada cambio (inicio/cierre de sesión).
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setState(
        session ? { status: "authenticated", session } : { status: "anonymous", session: null },
      );
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return state;
}
