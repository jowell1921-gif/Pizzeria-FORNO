import { z } from "zod";

import type { PrismaClient } from "../../db/client.js";
import { canEditContent, permissionsFor } from "../../auth/permissions.js";
import { notFound } from "../../errors.js";
import { recordAudit } from "../../utils/audit.js";

/** Longitud máxima del nombre de usuario: la que cabe en el botón «Mi cuenta» de la cabecera. */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 12;

const PHONE_PATTERN = /^\+?[0-9 ()-]{6,20}$/;

export const usernameSchema = z
  .string()
  .trim()
  .min(USERNAME_MIN, `Username must have at least ${USERNAME_MIN} characters`)
  .max(USERNAME_MAX, `Username must have at most ${USERNAME_MAX} characters`)
  .regex(
    /^[\p{L}\p{N}_.-]+$/u,
    "Username can only contain letters, numbers, dots, hyphens and underscores",
  );

export const phoneSchema = z.string().trim().regex(PHONE_PATTERN, "Invalid phone number");

/**
 * Datos que el usuario puede editar de su perfil. Es estricto: cualquier otro campo (correo, roles,
 * identificador…) se rechaza en lugar de ignorarse en silencio. El teléfono y el nombre de usuario,
 * una vez guardados, no pueden borrarse (no admiten null).
 */
export const updateProfileSchema = z
  .object({
    fullName: z.string().trim().min(1).max(120).optional(),
    username: usernameSchema.optional(),
    phone: phoneSchema.optional(),
    marketingConsent: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/** Un perfil está completo cuando tiene nombre de usuario y teléfono: lo exige el checkout. */
export function isProfileComplete(profile: { username: string | null; phone: string | null }) {
  return Boolean(profile.username && profile.phone);
}

/**
 * Perfil del usuario con sus roles y permisos efectivos. Los permisos salen de la base de datos,
 * nunca del cliente.
 */
export async function getProfile(
  prisma: PrismaClient,
  userId: string,
  selfAdminAvailable = false,
  ownerEmail?: string,
) {
  const profile = await prisma.profile.findUnique({
    where: { id: userId },
    include: { roles: true },
  });
  if (!profile || profile.deletedAt) throw notFound("Profile not found");

  const roles = profile.roles.map((entry) => entry.role).sort();
  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.fullName,
    username: profile.username,
    phone: profile.phone,
    profileComplete: isProfileComplete(profile),
    marketingConsent: profile.marketingConsent,
    roles,
    permissions: permissionsFor(roles, {
      readOnlyContent: !canEditContent(profile.email, ownerEmail),
    }),
    selfAdminAvailable,
    createdAt: profile.createdAt.toISOString(),
  };
}

/**
 * Actualiza los datos propios (nombre, usuario, teléfono y consentimiento de marketing, con su
 * fecha).
 */
export async function updateProfile(
  prisma: PrismaClient,
  userId: string,
  input: UpdateProfileInput,
  selfAdminAvailable = false,
  ownerEmail?: string,
) {
  const current = await prisma.profile.findUniqueOrThrow({ where: { id: userId } });

  // El consentimiento de marketing guarda cuándo se dio; al retirarlo se borra la fecha.
  const consentChanged =
    input.marketingConsent !== undefined && input.marketingConsent !== current.marketingConsent;

  await prisma.profile.update({
    where: { id: userId },
    data: {
      ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
      ...(input.username !== undefined ? { username: input.username } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(consentChanged
        ? {
            marketingConsent: input.marketingConsent!,
            marketingConsentAt: input.marketingConsent ? new Date() : null,
          }
        : {}),
    },
  });
  return getProfile(prisma, userId, selfAdminAvailable, ownerEmail);
}

/**
 * Función de demostración: el propio usuario se concede o se quita el rol ADMIN. Solo existe si el
 * servidor la activa (`SELF_ADMIN_ENABLED`); en producción responde 403. Queda en la auditoría.
 */
export async function setOwnAdminRole(
  prisma: PrismaClient,
  userId: string,
  admin: boolean,
  ownerEmail?: string,
) {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.userRole.findUnique({
      where: { userId_role: { userId, role: "ADMIN" } },
    });
    if (admin === Boolean(existing)) return; // ya está como se pide
    if (admin) {
      await tx.userRole.create({ data: { userId, role: "ADMIN", grantedById: userId } });
    } else if (existing) {
      await tx.userRole.delete({ where: { id: existing.id } });
    }
    await recordAudit(tx, {
      actorId: userId,
      action: admin ? "role.self-grant" : "role.self-revoke",
      entityType: "Profile",
      entityId: userId,
      before: { admin: !admin },
      after: { admin },
    });
  });
  return getProfile(prisma, userId, true, ownerEmail);
}
