import { z } from "zod";

import type { PrismaClient } from "../../db/client.js";
import { HttpError } from "../../errors.js";
import { usablePaymentMethods } from "../payments/availability.js";
import { isOpenAt, localTime } from "./opening-hours.js";
import { asapAvailable, listSlots, loadOpeningData } from "./scheduling.js";

const toDateString = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Datos públicos del local. No incluye los datos fiscales internos. `open` indica si está abierto
 * ahora mismo según el horario y los días especiales; `ordersPaused` es la pausa manual de pedidos.
 */
export async function getStoreSettings(
  prisma: PrismaClient,
  now = new Date(),
  onlineAvailable = false,
) {
  const settings = await prisma.storeSettings.findUnique({ where: { id: 1 } });
  if (!settings)
    throw new HttpError(503, "STORE_NOT_CONFIGURED", "The store is not configured yet");

  const today = localTime(now, settings.timezone).date;
  const [hours, specialRows] = await Promise.all([
    prisma.openingHours.findMany({
      where: { active: true },
      orderBy: [{ dayOfWeek: "asc" }, { openMinute: "asc" }],
    }),
    prisma.specialOpeningHours.findMany({
      where: { date: { gte: new Date(`${today}T00:00:00.000Z`) } },
      orderBy: { date: "asc" },
    }),
  ]);

  const openingHours = hours.map((slot) => ({
    dayOfWeek: slot.dayOfWeek,
    openMinute: slot.openMinute,
    closeMinute: slot.closeMinute,
  }));
  const specialDays = specialRows.map((day) => ({
    date: toDateString(day.date),
    closed: day.closed,
    openMinute: day.openMinute,
    closeMinute: day.closeMinute,
    note: day.note,
  }));

  return {
    name: settings.name,
    address: {
      line: settings.addressLine,
      postalCode: settings.postalCode,
      city: settings.city,
    },
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
    // Solo los métodos que se pueden usar de verdad ahora (el pago online, solo con la pasarela configurada).
    enabledPaymentMethods: usablePaymentMethods(settings.enabledPaymentMethods, onlineAvailable),
    slotMinutes: settings.slotMinutes,
    maxAdvanceDays: settings.maxAdvanceDays,
    loyalty: {
      pointsPerEuro: settings.loyaltyPointsPerEuro.toString(),
      expiryDays: settings.loyaltyExpiryDays,
    },
    openingHours,
    specialDays,
    open: isOpenAt(now, settings.timezone, openingHours, specialDays),
  };
}

export const slotsQuerySchema = z.object({
  type: z.enum(["PICKUP", "DELIVERY"]).default("PICKUP"),
  /** Fecha local «YYYY-MM-DD»; por defecto, hoy. */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
    .optional(),
});

/**
 * Franjas horarias seleccionables para recoger o recibir un pedido en una fecha, y si se puede
 * pedir «lo antes posible» ahora mismo. Depende del reloj del servidor, por eso no se guarda en caché.
 */
export async function getStoreSlots(prisma: PrismaClient, query: unknown, now = new Date()) {
  const { type, date } = slotsQuerySchema.parse(query);
  const settings = await prisma.storeSettings.findUnique({ where: { id: 1 } });
  if (!settings)
    throw new HttpError(503, "STORE_NOT_CONFIGURED", "The store is not configured yet");

  const today = localTime(now, settings.timezone).date;
  const day = date ?? today;
  const opening = await loadOpeningData(prisma, today);
  return {
    type,
    date: day,
    asapAvailable: asapAvailable(settings, opening, now),
    slotMinutes: settings.slotMinutes,
    slots: listSlots(settings, opening, type, day, now).map((slot) => slot.toISOString()),
  };
}
