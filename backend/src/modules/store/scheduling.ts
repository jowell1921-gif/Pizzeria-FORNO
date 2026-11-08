import type { PrismaClient } from "../../db/client.js";
import { isOpenAt, localTime, type SpecialDay, type WeeklySlot } from "./opening-hours.js";

export interface ScheduleSettings {
  timezone: string;
  prepTimeMinutes: number;
  deliveryTimeMinutes: number;
  slotMinutes: number;
  maxAdvanceDays: number;
  ordersPaused: boolean;
}

export interface OpeningData {
  weekly: WeeklySlot[];
  special: SpecialDay[];
}

const DAY_MS = 86_400_000;

/** Horario semanal y días especiales (de hoy en adelante) para calcular franjas y apertura. */
export async function loadOpeningData(
  prisma: Pick<PrismaClient, "openingHours" | "specialOpeningHours">,
  today: string,
): Promise<OpeningData> {
  const [hours, special] = await Promise.all([
    prisma.openingHours.findMany({ where: { active: true } }),
    prisma.specialOpeningHours.findMany({
      where: { date: { gte: new Date(`${today}T00:00:00.000Z`) } },
    }),
  ]);
  return {
    weekly: hours.map((slot) => ({
      dayOfWeek: slot.dayOfWeek,
      openMinute: slot.openMinute,
      closeMinute: slot.closeMinute,
    })),
    special: special.map((day) => ({
      date: day.date.toISOString().slice(0, 10),
      closed: day.closed,
      openMinute: day.openMinute,
      closeMinute: day.closeMinute,
    })),
  };
}

/** Instante UTC que corresponde a una fecha y un minuto del día en la zona horaria del local. */
export function zonedTimeToUtc(date: string, minute: number, timeZone: string): Date {
  const target = Date.parse(`${date}T00:00:00Z`) + minute * 60_000;
  let guess = target;
  // Dos pasadas bastan para absorber el desfase de la zona (incluidos los cambios de hora).
  for (let i = 0; i < 2; i += 1) {
    const local = localTime(new Date(guess), timeZone);
    guess -= Date.parse(`${local.date}T00:00:00Z`) + local.minute * 60_000 - target;
  }
  return new Date(guess);
}

/** Intervalos de apertura (en minutos) de una fecha: un día especial sustituye al horario semanal. */
function intervalsFor(date: string, data: OpeningData): Array<[number, number]> {
  const special = data.special.find((day) => day.date === date);
  if (special) {
    return special.closed || special.openMinute === null || special.closeMinute === null
      ? []
      : [[special.openMinute, special.closeMinute]];
  }
  const isoDay = localTime(new Date(`${date}T12:00:00Z`), "UTC").isoDay;
  return data.weekly
    .filter((slot) => slot.dayOfWeek === isoDay)
    .map((slot): [number, number] => [slot.openMinute, slot.closeMinute]);
}

export type OrderKind = "PICKUP" | "DELIVERY";

/** Minutos mínimos entre «ahora» y la hora de entrega o recogida. */
export function leadMinutes(settings: ScheduleSettings, type: OrderKind): number {
  return type === "PICKUP" ? settings.prepTimeMinutes : settings.deliveryTimeMinutes;
}

/**
 * Franjas seleccionables de una fecha: dentro del horario, alineadas con `slotMinutes` y con
 * antelación suficiente para preparar el pedido. Vacío si la fecha está fuera de plazo.
 */
export function listSlots(
  settings: ScheduleSettings,
  data: OpeningData,
  type: OrderKind,
  date: string,
  now: Date,
): Date[] {
  const today = localTime(now, settings.timezone).date;
  const last = new Date(Date.parse(`${today}T00:00:00Z`) + settings.maxAdvanceDays * DAY_MS)
    .toISOString()
    .slice(0, 10);
  if (date < today || date > last) return [];

  const earliest = now.getTime() + leadMinutes(settings, type) * 60_000;
  const slots: Date[] = [];
  for (const [open, close] of intervalsFor(date, data)) {
    const first = Math.ceil(open / settings.slotMinutes) * settings.slotMinutes;
    for (let minute = first; minute < close; minute += settings.slotMinutes) {
      const instant = zonedTimeToUtc(date, minute, settings.timezone);
      if (instant.getTime() >= earliest) slots.push(instant);
    }
  }
  return slots.sort((a, b) => a.getTime() - b.getTime());
}

/** ¿Se puede pedir «lo antes posible»? Solo con el local abierto ahora y sin pausa. */
export function asapAvailable(settings: ScheduleSettings, data: OpeningData, now: Date): boolean {
  return !settings.ordersPaused && isOpenAt(now, settings.timezone, data.weekly, data.special);
}
