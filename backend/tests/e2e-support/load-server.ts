import { randomUUID } from "node:crypto";

import { createApp } from "../../src/app.js";
import { createPrismaClient } from "../../src/db/client.js";
import { createTestAuth } from "../helpers/auth.js";

/**
 * API para medir rendimiento con autocannon (npm run perf). Usa la base de datos *_test, un
 * verificador de tokens local y límites de peticiones muy altos para no medir el propio límite.
 * Escribe en la salida un token de cliente válido y se queda escuchando.
 */
const PORT = Number(process.env["PORT"] ?? 4400);

async function main() {
  const url = process.env["DATABASE_URL"] ?? "";
  if (!/_test(\?|$)/.test(url)) throw new Error("load-server only runs against a *_test database");
  const prisma = createPrismaClient(url);
  const auth = await createTestAuth();
  const userId = randomUUID();
  await prisma.profile.create({
    data: {
      id: userId,
      email: `perf-${userId.slice(0, 8)}@example.test`,
      fullName: "Cliente de rendimiento",
      username: "perf_user",
      phone: "+34 600 000 000",
    },
  });
  const app = createApp(
    {
      CORS_ORIGINS: [],
      rateLimits: { windowMs: 60_000, ipMax: 1e9, userMax: 1e9, userWriteMax: 1e9 },
    },
    { prisma, verifyToken: auth.verifyToken },
  );
  app.listen(PORT, "127.0.0.1", async () => {
    console.log(`TOKEN=${await auth.sign({ sub: userId, expiresIn: "2h" })}`);
    console.log(`READY ${PORT}`);
  });
}

void main();
