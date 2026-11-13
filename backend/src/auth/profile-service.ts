import type { PrismaClient } from "../db/client.js";
import type { RoleName } from "../generated/prisma/enums.js";
import { conflict, forbidden } from "../errors.js";
import type { VerifiedIdentity } from "./token-verifier.js";

export interface ProfileWithRoles {
  id: string;
  email: string;
  roles: RoleName[];
}

const UNIQUE_VIOLATION = "P2002";

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === UNIQUE_VIOLATION;
}

function fallbackName(email: string): string {
  return email.split("@")[0] || email;
}

async function findProfile(prisma: PrismaClient, userId: string) {
  return prisma.profile.findUnique({ where: { id: userId }, include: { roles: true } });
}

/**
 * Devuelve el perfil del usuario autenticado y lo crea en su primera petición. Es idempotente y
 * seguro ante peticiones simultáneas. Los roles se leen siempre de la base de datos.
 *
 * - Si el perfil está desactivado (borrado lógico), se rechaza con 403.
 * - Si el correo cambió en Supabase, se sincroniza.
 */
export async function ensureProfile(
  prisma: PrismaClient,
  identity: VerifiedIdentity,
): Promise<ProfileWithRoles> {
  let profile = await findProfile(prisma, identity.userId);

  if (!profile) {
    try {
      await prisma.profile.create({
        data: {
          id: identity.userId,
          email: identity.email,
          fullName: identity.displayName ?? fallbackName(identity.email),
          // Todo cliente nace con su cuenta de puntos de FORNEA CLUB, a cero.
          loyaltyAccount: { create: {} },
        },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // O bien otra petición simultánea creó el perfil (se recupera abajo), o bien el correo ya
      // pertenece a otra cuenta.
    }
    profile = await findProfile(prisma, identity.userId);
    if (!profile) {
      throw conflict("ACCOUNT_CONFLICT", "This email is already linked to another account");
    }
  }

  if (profile.deletedAt) {
    throw forbidden("ACCOUNT_DISABLED", "This account is disabled");
  }

  if (profile.email !== identity.email) {
    try {
      profile = await prisma.profile.update({
        where: { id: profile.id },
        data: { email: identity.email },
        include: { roles: true },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      throw conflict("ACCOUNT_CONFLICT", "This email is already linked to another account");
    }
  }

  return {
    id: profile.id,
    email: profile.email,
    roles: profile.roles.map((entry) => entry.role),
  };
}
