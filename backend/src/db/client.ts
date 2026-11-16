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
    // Las transacciones con varias consultas (cambiar el estado de un pedido, crearlo…) tardaban más de los
    // 5 s por defecto cuando la API y la base de datos están en regiones distintas (cada consulta tarda
    // ~150 ms de ida y vuelta) y se cancelaban a medias: «el pedido se queda en Listo». Con holgura:
    transactionOptions: { maxWait: 10_000, timeout: 30_000 },
    adapter: new PrismaPg({
      connectionString,
      // Tamaño del pool explícito (en Supabase el límite de conexiones es bajo y se reparte entre réplicas).
      max: options.maxConnections ?? 10,
      // Sin plazo, una petición esperaría para siempre una conexión libre: mejor un error rápido.
      connectionTimeoutMillis: 10_000,
    }),
  });
}
