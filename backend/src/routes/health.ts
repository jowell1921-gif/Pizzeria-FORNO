import { Router } from "express";

import type { PrismaClient } from "../db/client.js";
import { HttpError } from "../errors.js";

/** Vivacidad: el proceso responde. La usa la plataforma para saber si hay que reiniciarlo. */
export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.json({ data: { status: "ok" } });
});

/**
 * Disponibilidad: además del proceso, la base de datos responde. Sirve a los monitores de
 * disponibilidad; no debe usarse como comprobación de reinicio (un corte breve de la base de datos
 * reiniciaría el servicio sin arreglar nada).
 */
export function createReadinessRouter(prisma: PrismaClient): Router {
  const router = Router();
  router.get("/ready", async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new HttpError(503, "NOT_READY", "The database is not reachable");
    }
    res.json({ data: { status: "ready" } });
  });
  return router;
}
