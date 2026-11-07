import type { PrismaClient } from "../../db/client.js";
import { HttpError } from "../../errors.js";
import { isOpenAt, localTime } from "./opening-hours.js";

const toDateString = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Datos públicos del local. No incluye los datos fiscales internos. `open` indica si está abierto
 * ahora mismo según el horario y los días especiales; `ordersPaused` es la pausa manual de pedidos.
 */
export async function getStoreSettings(prisma: PrismaClient, now = new Date()) {
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
    enabledPaymentMethods: settings.enabledPaymentMethods,
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
