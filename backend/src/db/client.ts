import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client.js";

export { Prisma, PrismaClient } from "../generated/prisma/client.js";

/**
 * Crea un cliente de Prisma conectado a PostgreSQL. Cada cliente mantiene su propio pool de
 * conexiones: debe cerrarse con `$disconnect()` cuando ya no se use.
 */
export function createPrismaClient(connectionString: string): PrismaClient {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to create a Prisma client");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}
