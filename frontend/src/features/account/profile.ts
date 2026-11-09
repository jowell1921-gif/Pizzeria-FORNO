import { z } from "zod";

import { apiRequest } from "@/lib/api";

export const ROLE_LABELS = {
  ADMIN: "Administrador",
  STAFF: "Personal",
  KITCHEN: "Cocina",
} as const;

/** Longitud del nombre de usuario: la máxima es la que cabe en el botón «Mi cuenta» de la cabecera. */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 12;

const PHONE_PATTERN = /^\+?[0-9 ()-]{6,20}$/;

export const profileSchema = z.object({
  id: z.string(),
  email: z.string(),
  fullName: z.string(),
  username: z.string().nullable(),
  phone: z.string().nullable(),
  profileComplete: z.boolean(),
  marketingConsent: z.boolean(),
  roles: z.array(z.enum(["ADMIN", "STAFF", "KITCHEN"])),
  permissions: z.array(z.string()),
  /** El servidor permite hacerse administrador desde la cuenta (solo demostración). */
  selfAdminAvailable: z.boolean().default(false),
  createdAt: z.string(),
});

export type Profile = z.infer<typeof profileSchema>;

/** Datos personales editables (formulario de «Completa tus datos» y de «Editar datos»). */
export const profileFormSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, "Introduce tu nombre completo")
    .max(120, "El nombre es demasiado largo"),
  username: z
    .string()
    .trim()
    .min(1, "Elige un nombre de usuario")
    .min(USERNAME_MIN, `El nombre de usuario debe tener al menos ${USERNAME_MIN} caracteres`)
    .max(USERNAME_MAX, `El nombre de usuario no puede superar los ${USERNAME_MAX} caracteres`)
    .regex(
      /^[\p{L}\p{N}_.-]+$/u,
      "Solo se permiten letras, números, puntos, guiones y guiones bajos (sin espacios)",
    ),
  phone: z
    .string()
    .trim()
    .min(1, "Introduce tu teléfono")
    .regex(PHONE_PATTERN, "Introduce un teléfono válido (por ejemplo, +34 600 000 000)"),
  marketingConsent: z.boolean(),
});

export type ProfileFormValues = z.infer<typeof profileFormSchema>;

export function fetchProfile(token: string) {
  return apiRequest("/me", { token, schema: profileSchema });
}

export function saveProfile(token: string, values: ProfileFormValues) {
  return apiRequest("/me", {
    token,
    method: "PATCH",
    body: {
      fullName: values.fullName,
      username: values.username,
      phone: values.phone,
      marketingConsent: values.marketingConsent,
    },
    schema: profileSchema,
  });
}
