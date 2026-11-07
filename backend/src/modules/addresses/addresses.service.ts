import { z } from "zod";

import type { PrismaClient } from "../../db/client.js";
import { conflict, notFound } from "../../errors.js";
import { phoneSchema } from "../me/me.service.js";

/** Máximo de direcciones guardadas por usuario. */
export const MAX_ADDRESSES = 10;

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

const addressFields = {
  label: optionalText(40),
  recipientName: z.string().trim().min(1).max(120),
  phone: phoneSchema.nullable().optional(),
  line1: z.string().trim().min(3).max(160),
  line2: optionalText(160),
  postalCode: z
    .string()
    .trim()
    .regex(/^[0-9]{5}$/, "Postal code must have 5 digits"),
  city: z.string().trim().min(1).max(80),
  province: optionalText(80),
  notes: optionalText(300),
  isDefault: z.boolean().optional(),
};

/** Estricto: no admite `userId`, `id` ni ningún campo desconocido. */
export const createAddressSchema = z.object(addressFields).strict();
export const updateAddressSchema = z
  .object(addressFields)
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

export type CreateAddressInput = z.infer<typeof createAddressSchema>;
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;

function view(address: {
  id: string;
  label: string | null;
  recipientName: string;
  phone: string | null;
  line1: string;
  line2: string | null;
  postalCode: string;
  city: string;
  province: string | null;
  notes: string | null;
  isDefault: boolean;
}) {
  return {
    id: address.id,
    label: address.label,
    recipientName: address.recipientName,
    phone: address.phone,
    line1: address.line1,
    line2: address.line2,
    postalCode: address.postalCode,
    city: address.city,
    province: address.province,
    notes: address.notes,
    isDefault: address.isDefault,
  };
}

const active = (userId: string) => ({ userId, deletedAt: null });

export async function listAddresses(prisma: PrismaClient, userId: string) {
  const rows = await prisma.address.findMany({
    where: active(userId),
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  return rows.map(view);
}

/** Busca una dirección del usuario. Si es de otra persona o no existe, 404. */
async function findOwn(prisma: PrismaClient, userId: string, id: string) {
  if (!z.uuid().safeParse(id).success) throw notFound("Address not found");
  const address = await prisma.address.findFirst({ where: { id, ...active(userId) } });
  if (!address) throw notFound("Address not found");
  return address;
}

export async function createAddress(
  prisma: PrismaClient,
  userId: string,
  input: CreateAddressInput,
) {
  return prisma.$transaction(async (tx) => {
    const count = await tx.address.count({ where: active(userId) });
    if (count >= MAX_ADDRESSES) {
      throw conflict("ADDRESS_LIMIT", `You can save up to ${MAX_ADDRESSES} addresses`);
    }

    // La primera dirección es la predeterminada; si se marca otra, se desmarca la anterior.
    const makeDefault = count === 0 || input.isDefault === true;
    if (makeDefault) {
      await tx.address.updateMany({
        where: { ...active(userId), isDefault: true },
        data: { isDefault: false },
      });
    }
    const created = await tx.address.create({
      data: { ...input, userId, isDefault: makeDefault },
    });
    return view(created);
  });
}

export async function updateAddress(
  prisma: PrismaClient,
  userId: string,
  id: string,
  input: UpdateAddressInput,
) {
  await findOwn(prisma, userId, id);
  return prisma.$transaction(async (tx) => {
    if (input.isDefault === true) {
      await tx.address.updateMany({
        where: { ...active(userId), isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }
    const updated = await tx.address.update({ where: { id }, data: input });
    return view(updated);
  });
}

/** Borrado lógico. Si era la predeterminada, la más antigua de las restantes pasa a serlo. */
export async function deleteAddress(prisma: PrismaClient, userId: string, id: string) {
  const address = await findOwn(prisma, userId, id);
  await prisma.$transaction(async (tx) => {
    await tx.address.update({ where: { id }, data: { deletedAt: new Date(), isDefault: false } });
    if (address.isDefault) {
      const next = await tx.address.findFirst({
        where: active(userId),
        orderBy: { createdAt: "asc" },
      });
      if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
    }
  });
}
