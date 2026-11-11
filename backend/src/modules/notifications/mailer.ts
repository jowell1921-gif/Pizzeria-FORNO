/**
 * Envío de correo. `send` devuelve «sent» si el correo salió hacia el destinatario y «skipped» si no se
 * ha enviado a propósito (modo registro, o destinatario no permitido): el aviso queda registrado y se
 * puede leer en el panel, pero no se dice que se haya enviado.
 */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  readonly driver: string;
  send(message: MailMessage): Promise<"sent" | "skipped">;
}

/** Sin proveedor de correo: no se envía nada. */
export function createLogMailer(): Mailer {
  return { driver: "log", send: async () => "skipped" };
}

export interface ResendOptions {
  apiKey: string;
  from: string;
  /** Si se indica, solo se envía a esa dirección; al resto se les «salta» el envío. */
  onlyTo?: string | undefined;
  fetchImpl?: typeof fetch;
}

/** Resend por su API HTTP (sin dependencias). Cualquier respuesta no correcta se trata como fallo. */
export function createResendMailer(options: ResendOptions): Mailer {
  const doFetch = options.fetchImpl ?? fetch;
  return {
    driver: "resend",
    async send(message) {
      if (options.onlyTo && message.to.toLowerCase() !== options.onlyTo.toLowerCase()) {
        return "skipped";
      }
      const response = await doFetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: options.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          html: message.html,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        throw new Error(`Resend responded ${response.status}`);
      }
      return "sent";
    },
  };
}
