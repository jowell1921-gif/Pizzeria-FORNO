import { z } from "zod";

/** Parámetros de paginación de la API: `?page=1&pageSize=10` (máximo 50 por página). */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

export function paginationArgs(query: unknown) {
  const { page, pageSize } = paginationSchema.parse(query);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function paginationMeta(page: number, pageSize: number, total: number) {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
