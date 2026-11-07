/**
 * Error esperado de la API: se convierte en una respuesta JSON con el formato
 * `{ error: { code, message, details?, requestId } }` y el código HTTP indicado.
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const unauthorized = (code = "UNAUTHENTICATED", message = "Authentication required") =>
  new HttpError(401, code, message);

export const forbidden = (code = "FORBIDDEN", message = "You are not allowed to do this") =>
  new HttpError(403, code, message);

export const notFound = (message = "Resource not found") =>
  new HttpError(404, "NOT_FOUND", message);

export const conflict = (code: string, message: string) => new HttpError(409, code, message);
