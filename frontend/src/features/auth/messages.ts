interface AuthErrorLike {
  code?: string;
  message?: string;
  status?: number;
  name?: string;
}

const MESSAGES: Record<string, string> = {
  invalid_credentials: "El correo o la contraseña no son correctos.",
  email_not_confirmed: "Aún no has confirmado tu correo. Revisa tu bandeja de entrada.",
  user_already_exists: "Ya existe una cuenta con ese correo. Prueba a iniciar sesión.",
  email_exists: "Ya existe una cuenta con ese correo. Prueba a iniciar sesión.",
  weak_password: "La contraseña es demasiado débil. Elige una más larga o más variada.",
  same_password: "La nueva contraseña debe ser distinta de la anterior.",
  over_email_send_rate_limit:
    "Has pedido demasiados correos. Espera unos minutos e inténtalo de nuevo.",
  over_request_rate_limit: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
  otp_expired: "El enlace ha caducado. Solicita uno nuevo.",
  flow_state_expired: "El enlace ha caducado. Solicita uno nuevo.",
  flow_state_not_found: "El enlace ya no es válido. Solicita uno nuevo.",
  signup_disabled: "El registro de nuevas cuentas no está disponible en este momento.",
  user_banned: "Esta cuenta está desactivada. Contacta con el local.",
  session_not_found: "Tu sesión ha caducado. Inicia sesión de nuevo.",
  provider_disabled: "Este método de acceso no está disponible todavía.",
};

export const GENERIC_AUTH_ERROR = "No hemos podido completar la operación. Inténtalo de nuevo.";
export const NOT_CONFIGURED_ERROR =
  "El acceso de usuarios no está configurado en este entorno (faltan las claves de Supabase).";
export const NETWORK_ERROR = "No se pudo conectar con el servicio de acceso. Revisa tu conexión.";

/**
 * Convierte un error de Supabase Auth en un mensaje en español para el usuario. Nunca se muestra el
 * texto original, que puede revelar detalles internos.
 */
export function authErrorMessage(error: AuthErrorLike | null | undefined): string {
  if (!error) return GENERIC_AUTH_ERROR;
  if (error.code && MESSAGES[error.code]) return MESSAGES[error.code]!;
  if (error.name === "AuthRetryableFetchError" || error.status === 0) return NETWORK_ERROR;
  if (error.status === 429) return MESSAGES["over_request_rate_limit"]!;
  return GENERIC_AUTH_ERROR;
}
