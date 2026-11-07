import type { PrismaClient } from "../db/client.js";
import type { RoleName } from "../generated/prisma/enums.js";
import { conflict, notFound } from "../errors.js";

interface RoleChange {
  email: string;
  role: RoleName;
  /** Quién realiza el cambio (null si se hace desde la línea de comandos). */
  actorId?: string | null;
  reason: string;
}

async function findUserByEmail(prisma: PrismaClient, email: string) {
  const user = await prisma.profile.findUnique({
    where: { email: email.trim().toLowerCase() },
    include: { roles: true },
  });
  if (!user || user.deletedAt) {
    throw notFound(
      "No active user with that email. The user must sign in at least once so their profile exists.",
    );
  }
  return user;
}

/** Concede un rol (idempotente) y lo registra en la auditoría. */
export async function grantRole(prisma: PrismaClient, change: RoleChange) {
  const user = await findUserByEmail(prisma, change.email);
  if (user.roles.some((entry) => entry.role === change.role)) {
    return { userId: user.id, changed: false };
  }

  await prisma.$transaction([
    prisma.userRole.create({
      data: { userId: user.id, role: change.role, grantedById: change.actorId ?? null },
    }),
    prisma.auditLog.create({
      data: {
        actorId: change.actorId ?? null,
        action: "role.grant",
        entityType: "UserRole",
        entityId: user.id,
        before: { roles: user.roles.map((entry) => entry.role) },
        after: { roles: [...user.roles.map((entry) => entry.role), change.role] },
        reason: change.reason,
      },
    }),
  ]);
  return { userId: user.id, changed: true };
}

/** Retira un rol y lo registra en la auditoría. Nunca deja la plataforma sin administradores. */
export async function revokeRole(prisma: PrismaClient, change: RoleChange) {
  const user = await findUserByEmail(prisma, change.email);
  if (!user.roles.some((entry) => entry.role === change.role)) {
    return { userId: user.id, changed: false };
  }

  if (change.role === "ADMIN") {
    const admins = await prisma.userRole.count({ where: { role: "ADMIN" } });
    if (admins <= 1) {
      throw conflict("LAST_ADMIN", "The last administrator cannot be removed");
    }
  }

  await prisma.$transaction([
    prisma.userRole.delete({ where: { userId_role: { userId: user.id, role: change.role } } }),
    prisma.auditLog.create({
      data: {
        actorId: change.actorId ?? null,
        action: "role.revoke",
        entityType: "UserRole",
        entityId: user.id,
        before: { roles: user.roles.map((entry) => entry.role) },
        after: {
          roles: user.roles.map((entry) => entry.role).filter((role) => role !== change.role),
        },
        reason: change.reason,
      },
    }),
  ]);
  return { userId: user.id, changed: true };
}
