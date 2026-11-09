import { z } from "zod";

import type { Prisma, PrismaClient } from "../../db/client.js";
import { conflict, HttpError, notFound } from "../../errors.js";
import { recordAudit } from "../../utils/audit.js";

const money = (value: Prisma.Decimal) => value.toFixed(2);
const uuid = z.uuid();
const amount = z.string().regex(/^\d{1,6}(\.\d{1,2})?$/, "Invalid amount");
const unprocessable = (code: string, message: string, details?: unknown) =>
  new HttpError(422, code, message, details);

const validTimeZone = (value: string) => {
  try {
    new Intl.DateTimeFormat("es-ES", { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

// ───────────────────────────── Datos del local ─────────────────────────────

const storeFields = {
  name: z.string().trim().min(1).max(80),
  legalName: z.string().trim().max(120).nullable(),
  taxId: z.string().trim().max(30).nullable(),
  addressLine: z.string().trim().min(1).max(160),
  postalCode: z
    .string()
    .trim()
    .regex(/^[0-9]{5}$/, "Postal code must have 5 digits"),
  city: z.string().trim().min(1).max(80),
  phone: z.string().trim().min(6).max(30),
  email: z.email().max(120),
  timezone: z.string().refine(validTimeZone, "Invalid time zone"),
  prepTimeMinutes: z.number().int().min(1).max(240),
  deliveryTimeMinutes: z.number().int().min(1).max(240),
  pickupEnabled: z.boolean(),
  deliveryEnabled: z.boolean(),
  ordersPaused: z.boolean(),
  pausedMessage: z.string().trim().max(200).nullable(),
  enabledPaymentMethods: z
    .array(z.enum(["ONLINE", "CASH_PICKUP", "CASH_DELIVERY"]))
    .min(1)
    .max(3),
  slotMinutes: z
    .number()
    .int()
    .refine((value) => [5, 10, 15, 20, 30, 60].includes(value), "Invalid slot length"),
  maxAdvanceDays: z.number().int().min(0).max(14),
};

/** Estricto y parcial: solo los campos enviados cambian. La conversión de puntos va en FORNO CLUB. */
export const storeSettingsPatchSchema = z
  .object(storeFields)
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

const settingsView = (settings: Prisma.StoreSettingsGetPayload<object>) => ({
  name: settings.name,
  legalName: settings.legalName,
  taxId: settings.taxId,
  addressLine: settings.addressLine,
  postalCode: settings.postalCode,
  city: settings.city,
  phone: settings.phone,
  email: settings.email,
  timezone: settings.timezone,
  currency: settings.currency,
  prepTimeMinutes: settings.prepTimeMinutes,
  deliveryTimeMinutes: settings.deliveryTimeMinutes,
  pickupEnabled: settings.pickupEnabled,
  deliveryEnabled: settings.deliveryEnabled,
  ordersPaused: settings.ordersPaused,
  pausedMessage: settings.pausedMessage,
  enabledPaymentMethods: settings.enabledPaymentMethods,
  slotMinutes: settings.slotMinutes,
  maxAdvanceDays: settings.maxAdvanceDays,
});

export async function getAdminStoreSettings(prisma: PrismaClient) {
  const settings = await prisma.storeSettings.findUnique({ where: { id: 1 } });
  if (!settings)
    throw new HttpError(503, "STORE_NOT_CONFIGURED", "The store is not configured yet");
  return settingsView(settings);
}

export async function updateStoreSettings(prisma: PrismaClient, actorId: string, body: unknown) {
  const input = storeSettingsPatchSchema.parse(body);
  await prisma.$transaction(async (tx) => {
    const before = await tx.storeSettings.findUnique({ where: { id: 1 } });
    if (!before)
      throw new HttpError(503, "STORE_NOT_CONFIGURED", "The store is not configured yet");
    const pickup = input.pickupEnabled ?? before.pickupEnabled;
    const delivery = input.deliveryEnabled ?? before.deliveryEnabled;
    if (!pickup && !delivery) {
      throw unprocessable("NO_ORDER_TYPE", "At least pickup or delivery must stay enabled");
    }
    const after = await tx.storeSettings.update({ where: { id: 1 }, data: input });
    const changed = Object.keys(input) as Array<keyof typeof input>;
    const pick = (settings: Prisma.StoreSettingsGetPayload<object>) =>
      Object.fromEntries(changed.map((key) => [key, (settings as Record<string, unknown>)[key]]));
    await recordAudit(tx, {
      actorId,
      action:
        input.ordersPaused !== undefined &&
        changed.every((key) => key === "ordersPaused" || key === "pausedMessage")
          ? "store.pause"
          : "store.update",
      entityType: "StoreSettings",
      entityId: "1",
      before: pick(before) as Prisma.InputJsonValue,
      after: pick(after) as Prisma.InputJsonValue,
    });
  });
  return getAdminStoreSettings(prisma);
}

// ───────────────────────────── Horarios ─────────────────────────────

const slotSchema = z
  .object({
    dayOfWeek: z.number().int().min(1).max(7),
    openMinute: z.number().int().min(0).max(1439),
    closeMinute: z.number().int().min(1).max(1440),
  })
  .strict();

export const openingHoursSchema = z
  .object({ slots: z.array(slotSchema).max(28) })
  .strict()
  .superRefine((value, ctx) => {
    for (const [index, slot] of value.slots.entries()) {
      if (slot.openMinute >= slot.closeMinute) {
        ctx.addIssue({
          code: "custom",
          path: ["slots", index],
          message: "The opening time must be before the closing time",
        });
      }
    }
    const byDay = new Map<number, typeof value.slots>();
    for (const slot of value.slots)
      byDay.set(slot.dayOfWeek, [...(byDay.get(slot.dayOfWeek) ?? []), slot]);
    for (const slots of byDay.values()) {
      const sorted = [...slots].sort((a, b) => a.openMinute - b.openMinute);
      for (let i = 1; i < sorted.length; i += 1) {
        if (sorted[i]!.openMinute < sorted[i - 1]!.closeMinute) {
          ctx.addIssue({
            code: "custom",
            path: ["slots"],
            message: "Opening times of a day must not overlap",
          });
        }
      }
    }
  });

const hoursView = (rows: Array<{ dayOfWeek: number; openMinute: number; closeMinute: number }>) =>
  rows
    .map((row) => ({
      dayOfWeek: row.dayOfWeek,
      openMinute: row.openMinute,
      closeMinute: row.closeMinute,
    }))
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.openMinute - b.openMinute);

export async function getOpeningHours(prisma: PrismaClient) {
  return hoursView(await prisma.openingHours.findMany({ where: { active: true } }));
}

/** Sustituye todo el horario semanal. Un día sin tramos es un día cerrado. */
export async function replaceOpeningHours(prisma: PrismaClient, actorId: string, body: unknown) {
  const { slots } = openingHoursSchema.parse(body);
  await prisma.$transaction(async (tx) => {
    const before = hoursView(await tx.openingHours.findMany({ where: { active: true } }));
    await tx.openingHours.deleteMany();
    if (slots.length > 0) await tx.openingHours.createMany({ data: slots });
    await recordAudit(tx, {
      actorId,
      action: "store.opening-hours",
      entityType: "OpeningHours",
      before: before as unknown as Prisma.InputJsonValue,
      after: hoursView(slots) as unknown as Prisma.InputJsonValue,
    });
  });
  return getOpeningHours(prisma);
}

// ───────────────────────────── Días especiales y festivos ─────────────────────────────

export const specialDaySchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
    closed: z.boolean(),
    openMinute: z.number().int().min(0).max(1439).nullable().optional(),
    closeMinute: z.number().int().min(1).max(1440).nullable().optional(),
    note: z.string().trim().max(120).nullable().optional(),
  })
  .strict()
  .superRefine((day, ctx) => {
    if (Number.isNaN(Date.parse(`${day.date}T00:00:00Z`))) {
      ctx.addIssue({ code: "custom", path: ["date"], message: "Invalid date" });
    }
    if (day.closed) {
      if (day.openMinute != null || day.closeMinute != null) {
        ctx.addIssue({
          code: "custom",
          path: ["openMinute"],
          message: "A closed day has no hours",
        });
      }
    } else if (
      day.openMinute == null ||
      day.closeMinute == null ||
      day.openMinute >= day.closeMinute
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["openMinute"],
        message: "Special opening hours need a valid range",
      });
    }
  });

const specialView = (day: Prisma.SpecialOpeningHoursGetPayload<object>) => ({
  id: day.id,
  date: day.date.toISOString().slice(0, 10),
  closed: day.closed,
  openMinute: day.openMinute,
  closeMinute: day.closeMinute,
  note: day.note,
});

/** Días especiales de hace una semana en adelante. */
export async function listSpecialDays(prisma: PrismaClient, now = new Date()) {
  const from = new Date(now.getTime() - 7 * 86_400_000);
  const rows = await prisma.specialOpeningHours.findMany({
    where: { date: { gte: new Date(`${from.toISOString().slice(0, 10)}T00:00:00.000Z`) } },
    orderBy: { date: "asc" },
  });
  return rows.map(specialView);
}

export async function createSpecialDay(prisma: PrismaClient, actorId: string, body: unknown) {
  const input = specialDaySchema.parse(body);
  const date = new Date(`${input.date}T00:00:00.000Z`);
  const created = await prisma.$transaction(async (tx) => {
    if (await tx.specialOpeningHours.findFirst({ where: { date } })) {
      throw conflict("SPECIAL_DAY_EXISTS", "There is already a special day on this date");
    }
    const day = await tx.specialOpeningHours.create({
      data: {
        date,
        closed: input.closed,
        openMinute: input.closed ? null : (input.openMinute ?? null),
        closeMinute: input.closed ? null : (input.closeMinute ?? null),
        note: input.note ?? null,
      },
    });
    await recordAudit(tx, {
      actorId,
      action: "store.special-day.create",
      entityType: "SpecialOpeningHours",
      entityId: day.id,
      after: specialView(day) as unknown as Prisma.InputJsonValue,
    });
    return day;
  });
  return specialView(created);
}

export async function deleteSpecialDay(prisma: PrismaClient, actorId: string, id: string) {
  if (!uuid.safeParse(id).success) throw notFound("Special day not found");
  await prisma.$transaction(async (tx) => {
    const day = await tx.specialOpeningHours.findUnique({ where: { id } });
    if (!day) throw notFound("Special day not found");
    await tx.specialOpeningHours.delete({ where: { id } });
    await recordAudit(tx, {
      actorId,
      action: "store.special-day.delete",
      entityType: "SpecialOpeningHours",
      entityId: id,
      before: specialView(day) as unknown as Prisma.InputJsonValue,
    });
  });
}

// ───────────────────────────── Zonas de reparto ─────────────────────────────

const zoneFields = {
  name: z.string().trim().min(2).max(80),
  postalCodes: z
    .array(z.string().regex(/^[0-9]{5}$/, "Postal code must have 5 digits"))
    .min(1)
    .max(100),
  deliveryFee: amount,
  minimumOrder: amount,
  estimatedMinutes: z.number().int().min(1).max(240),
  active: z.boolean(),
};

export const zoneInputSchema = z
  .object({ ...zoneFields, active: zoneFields.active.optional() })
  .strict();
export const zonePatchSchema = z
  .object(zoneFields)
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

const zoneView = (zone: Prisma.DeliveryZoneGetPayload<object>) => ({
  id: zone.id,
  name: zone.name,
  postalCodes: zone.postalCodes,
  deliveryFee: money(zone.deliveryFee),
  minimumOrder: money(zone.minimumOrder),
  estimatedMinutes: zone.estimatedMinutes,
  active: zone.active,
});

export async function listAdminZones(prisma: PrismaClient) {
  const zones = await prisma.deliveryZone.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
  });
  return zones.map(zoneView);
}

/** Un código postal no puede estar en dos zonas activas: el reparto sería ambiguo. */
async function assertFreePostalCodes(
  tx: Prisma.TransactionClient,
  codes: string[],
  exceptId: string | null,
) {
  const clash = await tx.deliveryZone.findFirst({
    where: {
      active: true,
      deletedAt: null,
      postalCodes: { hasSome: codes },
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
    },
  });
  if (clash) {
    throw unprocessable(
      "POSTAL_CODE_IN_USE",
      `A postal code already belongs to the zone "${clash.name}"`,
    );
  }
}

export async function createZone(prisma: PrismaClient, actorId: string, body: unknown) {
  const input = zoneInputSchema.parse(body);
  const codes = [...new Set(input.postalCodes)];
  const zone = await prisma.$transaction(async (tx) => {
    if (input.active !== false) await assertFreePostalCodes(tx, codes, null);
    const created = await tx.deliveryZone.create({
      data: { ...input, postalCodes: codes, active: input.active ?? true },
    });
    await recordAudit(tx, {
      actorId,
      action: "zone.create",
      entityType: "DeliveryZone",
      entityId: created.id,
      after: zoneView(created) as unknown as Prisma.InputJsonValue,
    });
    return created;
  });
  return zoneView(zone);
}

export async function updateZone(prisma: PrismaClient, actorId: string, id: string, body: unknown) {
  const input = zonePatchSchema.parse(body);
  if (!uuid.safeParse(id).success) throw notFound("Zone not found");
  const zone = await prisma.$transaction(async (tx) => {
    const before = await tx.deliveryZone.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw notFound("Zone not found");
    const codes = input.postalCodes ? [...new Set(input.postalCodes)] : before.postalCodes;
    if ((input.active ?? before.active) && (input.postalCodes || input.active === true)) {
      await assertFreePostalCodes(tx, codes, id);
    }
    const after = await tx.deliveryZone.update({
      where: { id },
      data: { ...input, ...(input.postalCodes ? { postalCodes: codes } : {}) },
    });
    await recordAudit(tx, {
      actorId,
      action: "zone.update",
      entityType: "DeliveryZone",
      entityId: id,
      before: zoneView(before) as unknown as Prisma.InputJsonValue,
      after: zoneView(after) as unknown as Prisma.InputJsonValue,
    });
    return after;
  });
  return zoneView(zone);
}

export async function deleteZone(prisma: PrismaClient, actorId: string, id: string) {
  if (!uuid.safeParse(id).success) throw notFound("Zone not found");
  await prisma.$transaction(async (tx) => {
    const zone = await tx.deliveryZone.findFirst({ where: { id, deletedAt: null } });
    if (!zone) throw notFound("Zone not found");
    await tx.deliveryZone.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
    await recordAudit(tx, {
      actorId,
      action: "zone.delete",
      entityType: "DeliveryZone",
      entityId: id,
      before: zoneView(zone) as unknown as Prisma.InputJsonValue,
    });
  });
}
