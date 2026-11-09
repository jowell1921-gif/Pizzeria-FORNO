import type { Prisma } from "../db/client.js";

interface AuditEntry {
  actorId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
  reason?: string | null;
}

/**
 * Registra una operación administrativa (quién, qué, sobre qué y con qué valores antes y después).
 * Se llama dentro de la misma transacción que el cambio: si el cambio se deshace, el registro también.
 */
export async function recordAudit(
  tx: Pick<Prisma.TransactionClient, "auditLog">,
  entry: AuditEntry,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      before: entry.before ?? undefined,
      after: entry.after ?? undefined,
      reason: entry.reason ?? null,
    },
  });
}
