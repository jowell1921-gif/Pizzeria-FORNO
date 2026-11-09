import { z } from "zod";

import type { Prisma, PrismaClient } from "../../db/client.js";
import { paginationMeta } from "../../utils/pagination.js";

export const auditQuerySchema = z.object({
  entityType: z.string().trim().min(1).max(40).optional(),
  action: z.string().trim().min(1).max(60).optional(),
  actorId: z.uuid().optional(),
  entityId: z.string().trim().min(1).max(64).optional(),
});

/** Registro de operaciones administrativas, de la más reciente a la más antigua. Permiso `audit:read`. */
export async function listAudit(
  prisma: PrismaClient,
  query: unknown,
  paging: { page: number; pageSize: number; skip: number; take: number },
) {
  const filters = auditQuerySchema.parse(query);
  const where: Prisma.AuditLogWhereInput = {
    ...(filters.entityType ? { entityType: filters.entityType } : {}),
    ...(filters.action ? { action: { startsWith: filters.action } } : {}),
    ...(filters.actorId ? { actorId: filters.actorId } : {}),
    ...(filters.entityId ? { entityId: filters.entityId } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: paging.skip,
      take: paging.take,
      include: { actor: { select: { fullName: true, email: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);
  return {
    data: rows.map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      actor: row.actor,
      before: row.before,
      after: row.after,
      reason: row.reason,
      createdAt: row.createdAt.toISOString(),
    })),
    meta: paginationMeta(paging.page, paging.pageSize, total),
  };
}
