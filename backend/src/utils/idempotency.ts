import { createHash } from "node:crypto";

import type { Prisma, PrismaClient } from "../db/client.js";
import { HttpError } from "../errors.js";

const KEY_PATTERN = /^[A-Za-z0-9_.:-]{8,255}$/;
const TTL_MS = 24 * 60 * 60 * 1000;

export interface IdempotentResult {
  status: number;
  body: unknown;
}

/** JSON con las claves ordenadas: la misma petición produce siempre la misma huella. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function requireIdempotencyKey(header: string | undefined): string {
  if (!header || !KEY_PATTERN.test(header)) {
    throw new HttpError(
      400,
      "IDEMPOTENCY_KEY_REQUIRED",
      "The Idempotency-Key header is required (8-255 characters: letters, digits and _ . : -)",
    );
  }
  return header;
}

/**
 * Ejecuta una operación una sola vez por clave de idempotencia y usuario.
 *
 * - Primera petición: se reserva la clave (el registro actúa como cerrojo), se ejecuta y se guarda la
 *   respuesta.
 * - Repetición con la misma clave y el mismo cuerpo: se devuelve la respuesta guardada, sin repetir
 *   la operación (por ejemplo, un doble clic o un reintento tras perder la conexión).
 * - Misma clave con otro cuerpo: error 422.
 * - Misma clave mientras la primera aún se ejecuta: error 409.
 * - Si la operación falla, la reserva se elimina para poder reintentar con la misma clave.
 */
export async function runIdempotent(
  prisma: PrismaClient,
  options: { userId: string; endpoint: string; key: string; body: unknown },
  operation: () => Promise<IdempotentResult>,
): Promise<IdempotentResult & { replayed: boolean }> {
  const requestHash = createHash("sha256").update(canonical(options.body)).digest("hex");
  const where = {
    userId_endpoint_key: { userId: options.userId, endpoint: options.endpoint, key: options.key },
  } satisfies Prisma.IdempotencyRecordWhereUniqueInput;

  // Limpieza oportunista de las claves caducadas del propio usuario.
  await prisma.idempotencyRecord.deleteMany({
    where: { userId: options.userId, expiresAt: { lt: new Date() } },
  });

  try {
    await prisma.idempotencyRecord.create({
      data: {
        userId: options.userId,
        endpoint: options.endpoint,
        key: options.key,
        requestHash,
        expiresAt: new Date(Date.now() + TTL_MS),
      },
    });
  } catch (error) {
    if ((error as { code?: string } | null)?.code !== "P2002") throw error;
    const existing = await prisma.idempotencyRecord.findUnique({ where });
    if (!existing) throw new HttpError(409, "REQUEST_IN_PROGRESS", "Try again in a moment");
    if (existing.requestHash !== requestHash) {
      throw new HttpError(
        422,
        "IDEMPOTENCY_KEY_REUSED",
        "This Idempotency-Key was already used with a different request",
      );
    }
    if (existing.responseStatus === null) {
      throw new HttpError(409, "REQUEST_IN_PROGRESS", "The request is still being processed");
    }
    return { status: existing.responseStatus, body: existing.responseBody, replayed: true };
  }

  try {
    const result = await operation();
    await prisma.idempotencyRecord.update({
      where,
      data: { responseStatus: result.status, responseBody: result.body as Prisma.InputJsonValue },
    });
    return { ...result, replayed: false };
  } catch (error) {
    await prisma.idempotencyRecord.deleteMany({
      where: { userId: options.userId, endpoint: options.endpoint, key: options.key },
    });
    throw error;
  }
}
