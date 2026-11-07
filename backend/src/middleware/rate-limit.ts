import type { Request, RequestHandler } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";

import { HttpError } from "../errors.js";

export interface RateLimitConfig {
  /** Ventana de tiempo (ms). */
  windowMs: number;
  /** Peticiones por ventana y por IP a toda la API. */
  ipMax: number;
  /** Peticiones por ventana y por usuario autenticado. */
  userMax: number;
  /** Peticiones de escritura (POST, PATCH, PUT, DELETE) por ventana y por usuario autenticado. */
  userWriteMax: number;
}

export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  windowMs: 60_000,
  ipMax: 300,
  userMax: 240,
  userWriteMax: 30,
};

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function createLimiter(
  windowMs: number,
  limit: number,
  key: (req: Request) => string,
  skip?: (req: Request) => boolean,
): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (req) => key(req as Request),
    skip: skip ? (req) => skip(req as Request) : undefined,
    // Se responde con el formato de error de la API (la cabecera Retry-After la añade la librería).
    handler: (_req, _res, next) =>
      next(new HttpError(429, "RATE_LIMITED", "Too many requests, try again later")),
  });
}

/** Límite por IP para toda la API (frena abusos de visitantes anónimos y de tokens inválidos). */
export function ipRateLimit(config: RateLimitConfig): RequestHandler {
  return createLimiter(config.windowMs, config.ipMax, (req) => ipKeyGenerator(req.ip ?? "unknown"));
}

/** Límites por usuario autenticado. Montar después de `authenticate`. */
export function userRateLimits(config: RateLimitConfig): RequestHandler[] {
  const userKey = (req: Request) => `user:${req.auth?.userId ?? "unknown"}`;
  return [
    createLimiter(config.windowMs, config.userMax, userKey),
    createLimiter(
      config.windowMs,
      config.userWriteMax,
      (req) => `write:${userKey(req)}`,
      (req) => READ_METHODS.has(req.method),
    ),
  ];
}
