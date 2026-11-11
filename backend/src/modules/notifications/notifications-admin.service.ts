import { z } from "zod";

import type { Prisma, PrismaClient } from "../../db/client.js";
import { paginationMeta } from "../../utils/pagination.js";
import { EMAIL_TEMPLATES } from "./templates.js";

export const notificationsQuerySchema = z.object({
  status: z.enum(["PENDING", "SENT", "FAILED", "LOGGED"]).optional(),
  template: z.enum(EMAIL_TEMPLATES).optional(),
  q: z.string().trim().min(1).max(80).optional(),
});

/** Avisos por correo con su estado y contenido, del más reciente al más antiguo. */
export async function listNotifications(
  prisma: PrismaClient,
  query: unknown,
  paging: { page: number; pageSize: number; skip: number; take: number },
) {
  const filters = notificationsQuerySchema.parse(query);
  const where: Prisma.NotificationLogWhereInput = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.template ? { template: filters.template } : {}),
    ...(filters.q ? { recipient: { contains: filters.q, mode: "insensitive" } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.notificationLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: paging.skip,
      take: paging.take,
      include: { order: { select: { orderNumber: true } } },
    }),
    prisma.notificationLog.count({ where }),
  ]);
  return {
    data: rows.map((row) => ({
      id: row.id,
      template: row.template,
      recipient: row.recipient,
      subject: row.subject,
      body: row.bodyText,
      status: row.status,
      attempts: row.attempts,
      lastError: row.lastError,
      orderNumber: row.order?.orderNumber ?? null,
      createdAt: row.createdAt.toISOString(),
      sentAt: row.sentAt?.toISOString() ?? null,
    })),
    meta: paginationMeta(paging.page, paging.pageSize, total),
  };
}
