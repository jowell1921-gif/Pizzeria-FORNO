import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client.js";

export { Prisma, PrismaClient } from "../generated/prisma/client.js";

/**
 * Crea un cliente de Prisma conectado a PostgreSQL. Cada cliente mantiene su propio pool de
 * conexiones: debe cerrarse con `$disconnect()` cuando ya no se use.
 */
export function createPrismaClient(
  connectionString: string,
  options: { maxConnections?: number } = {},
): PrismaClient {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to create a Prisma client");
  }
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      // Tamaño del pool explícito (en Supabase el límite de conexiones es bajo y se reparte entre réplicas).
      max: options.maxConnections ?? 10,
      // Sin plazo, una petición esperaría para siempre una conexión libre: mejor un error rápido.
      connectionTimeoutMillis: 10_000,
    }),
  });
}
