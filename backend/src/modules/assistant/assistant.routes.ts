import { Router } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";

import { HttpError } from "../../errors.js";
import type { AssistantService } from "./assistant.service.js";

export interface AssistantRouterOptions {
  /** Mensajes por IP y ventana. Por defecto, 20 cada 10 minutos. */
  limit?: number;
  windowMs?: number;
}

/**
 * Chat de PizzAI. Es público (también para visitantes), por lo que lleva su propio límite por IP,
 * además del límite diario global del servicio. Sin la clave del proveedor de IA (`service`
 * indefinido) el chat no existe y la web usa el modo de demostración.
 */
export function createAssistantRouter(
  service: AssistantService | undefined,
  options: AssistantRouterOptions = {},
): Router {
  const router = Router();

  router.get("/status", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ data: { available: Boolean(service) } });
  });

  const limiter = rateLimit({
    windowMs: options.windowMs ?? 10 * 60_000,
    limit: options.limit ?? 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(req.ip ?? "unknown"),
    handler: (_req, _res, next) =>
      next(new HttpError(429, "RATE_LIMITED", "Too many requests, try again later")),
  });

  router.post("/chat", async (req, res) => {
    if (!service) {
      throw new HttpError(503, "ASSISTANT_NOT_CONFIGURED", "The AI assistant is not available");
    }
    await new Promise<void>((resolve, reject) => {
      limiter(req, res, (error?: unknown) => (error ? reject(error) : resolve()));
    });
    // Si el visitante cierra la pestaña, se cancela la petición al proveedor (y su coste).
    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });
    res.setHeader("Cache-Control", "no-store");
    res.json({ data: await service.chat(req.body, controller.signal) });
  });

  return router;
}
