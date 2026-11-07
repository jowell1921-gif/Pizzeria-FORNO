import { createApp } from "../../src/app.js";
import type { PrismaClient } from "../db/helpers.js";
import { createUser } from "../db/helpers.js";
import { createTestAuth } from "./auth.js";

/** Aplicación Express real (con PostgreSQL de pruebas) y una forma cómoda de «iniciar sesión». */
export async function createTestApp(prisma: PrismaClient) {
  const auth = await createTestAuth();
  const app = createApp(
    { CORS_ORIGINS: ["http://localhost:3000"] },
    { prisma, verifyToken: auth.verifyToken },
  );

  /** Crea un usuario con perfil y devuelve su cabecera de autorización. */
  async function userWithToken(overrides: Parameters<typeof createUser>[1] = {}) {
    const user = await createUser(prisma, overrides);
    const token = await auth.sign({ sub: user.id, email: user.email });
    return { user, headers: { Authorization: `Bearer ${token}` } };
  }

  return { app, auth, userWithToken };
}
