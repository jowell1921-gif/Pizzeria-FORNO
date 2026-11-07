import type { ErrorRequestHandler, RequestHandler, Response } from "express";
import { ZodError } from "zod";

import { HttpError } from "../errors.js";

function send(res: Response, status: number, code: string, message: string, details?: unknown) {
  res.status(status).json({
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
      requestId: res.locals["requestId"],
    },
  });
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  send(res, 404, "NOT_FOUND", "Resource not found");
};

export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof HttpError) {
    send(res, err.status, err.code, err.message, err.details);
    return;
  }

  if (err instanceof ZodError) {
    send(
      res,
      400,
      "VALIDATION_ERROR",
      "The request is not valid",
      err.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    );
    return;
  }

  // Errores del analizador del cuerpo (JSON mal formado o demasiado grande).
  const type = (err as { type?: string } | null)?.type;
  if (type === "entity.parse.failed") {
    send(res, 400, "INVALID_JSON", "The request body is not valid JSON");
    return;
  }
  if (type === "entity.too.large") {
    send(res, 413, "PAYLOAD_TOO_LARGE", "The request body is too large");
    return;
  }

  // Error inesperado: se registra con el identificador de la petición y no se filtra al cliente.
  req.log.error({ err }, "Unhandled error");
  send(res, 500, "INTERNAL_ERROR", "An unexpected error occurred");
};
