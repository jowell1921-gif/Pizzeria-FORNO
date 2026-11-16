import type { EmailOtpType } from "@supabase/supabase-js";

/** Tipos de enlace de correo de Supabase que admite `/auth/confirm`. */
export const OTP_TYPES: readonly EmailOtpType[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
];

export function isOtpType(value: string | null | undefined): value is EmailOtpType {
  return OTP_TYPES.includes(value as EmailOtpType);
}

/** Ruta de la página intermedia que pide un clic antes de gastar el enlace (ver `/auth/confirm`). */
export const CONFIRM_PAGE_PATH = "/confirmar-correo";
