import type { RequestHandler } from "express";

/**
 * Cabeceras de caché para datos públicos que cambian poco (carta, horarios…). `max-age` corto:
 * un cambio del administrador se ve en menos de un minuto.
 */
export function publicCache(seconds = 30): RequestHandler {
  return (_req, res, next) => {
    res.setHeader(
      "Cache-Control",
      `public, max-age=${seconds}, stale-while-revalidate=${seconds * 2}`,
    );
    next();
  };
}
