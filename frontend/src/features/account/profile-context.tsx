"use client";

import { createContext, useContext, type ReactNode } from "react";

import { useAuthState, type AuthState } from "@/features/auth/use-auth-state";

import { fetchProfile, type Profile } from "./profile";
import { useApiResource, type ResourceStatus } from "./use-api-resource";

interface ProfileContextValue {
  auth: AuthState;
  /** Token de la sesión, para las llamadas a la API (null si no hay sesión). */
  token: string | null;
  profileStatus: ResourceStatus;
  profile: Profile | undefined;
  profileError: unknown;
  /** Sustituye el perfil cargado (por ejemplo, tras guardar), para que la cabecera se actualice al instante. */
  setProfile: (profile: Profile) => void;
  reloadProfile: () => void;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

/**
 * Carga el perfil del usuario (nombre de usuario, roles…) una sola vez y lo comparte entre la
 * cabecera y las páginas de la cuenta. Solo adapta la interfaz: la seguridad la aplica el backend.
 */
export function ProfileProvider({ children }: { children: ReactNode }) {
  const auth = useAuthState();
  const token = auth.status === "authenticated" ? auth.session.access_token : null;
  const resource = useApiResource(token, fetchProfile);

  const value: ProfileContextValue = {
    auth,
    token,
    profileStatus: resource.status,
    profile: resource.data,
    profileError: resource.error,
    setProfile: (profile) => resource.mutate(() => profile),
    reloadProfile: resource.reload,
  };

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileContextValue {
  const context = useContext(ProfileContext);
  if (!context) throw new Error("useProfile must be used inside <ProfileProvider>");
  return context;
}

/** Como `useProfile`, pero devuelve null fuera del proveedor (componentes que funcionan sin sesión). */
export function useOptionalProfile(): ProfileContextValue | null {
  return useContext(ProfileContext);
}
