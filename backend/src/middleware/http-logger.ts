import type { RequestHandler } from "express";
import { pino, type Logger } from "pino";
import { pinoHttp } from "pino-http";

/**
 * Registro de peticiones en JSON (una línea por petición) con el identificador de la petición.
 * Solo se registran método, ruta, código y duración: nunca cabeceras (Authorization, cookies) ni
 * cuerpos, que pueden contener datos personales o credenciales.
 */
export function createLogger(level: string, pretty = false): Logger {
  return pino({
    level,
    redact: ["req.headers", "res.headers"],
    ...(pretty ? { transport: { target: "pino-pretty" } } : {}),
  });
}

export function httpLogger(logger: Logger): RequestHandler {
  return pinoHttp({
    logger,
    genReqId: (_req, res) => String(res.locals["requestId"]),
    autoLogging: { ignore: (req) => req.url?.startsWith("/api/v1/health") ?? false },
    customLogLevel: (_req, res, error) =>
      error || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
    serializers: {
      req: (req: { id: string; method: string; url: string }) => ({
        id: req.id,
        method: req.method,
        // La ruta sin la cadena de consulta.
        url: req.url.split("?")[0],
      }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
  });
}
