export interface WeeklySlot {
  /** Día ISO: 1 = lunes … 7 = domingo. */
  dayOfWeek: number;
  /** Minutos desde las 00:00. */
  openMinute: number;
  closeMinute: number;
}

export interface SpecialDay {
  /** Fecha local «YYYY-MM-DD». */
  date: string;
  closed: boolean;
  openMinute: number | null;
  closeMinute: number | null;
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Fecha, día ISO y minuto del día en la zona horaria del local. */
export function localTime(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    isoDay: WEEKDAYS[get("weekday")] ?? 1,
    minute: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

/**
 * ¿Está el local abierto en este instante? Un día especial (festivo, horario especial) sustituye
 * al horario semanal de esa fecha.
 */
export function isOpenAt(
  now: Date,
  timeZone: string,
  weekly: readonly WeeklySlot[],
  special: readonly SpecialDay[],
): boolean {
  const { date, isoDay, minute } = localTime(now, timeZone);

  const override = special.find((day) => day.date === date);
  if (override) {
    if (override.closed || override.openMinute === null || override.closeMinute === null) {
      return false;
    }
    return minute >= override.openMinute && minute < override.closeMinute;
  }

  return weekly.some(
    (slot) => slot.dayOfWeek === isoDay && minute >= slot.openMinute && minute < slot.closeMinute,
  );
}
