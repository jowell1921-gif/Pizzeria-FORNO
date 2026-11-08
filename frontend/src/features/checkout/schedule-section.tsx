"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchSlots } from "@/features/catalog/api";
import type { StoreSettings } from "@/features/catalog/schemas";
import { cn } from "@/lib/utils";

export interface ScheduleValue {
  mode: "asap" | "slot";
  /** Fecha local «YYYY-MM-DD» de las franjas mostradas. */
  date: string | null;
  /** Instante UTC (ISO) de la franja elegida. */
  slot: string | null;
}

interface ScheduleSectionProps {
  type: "PICKUP" | "DELIVERY";
  settings: StoreSettings;
  value: ScheduleValue;
  onChange: (value: ScheduleValue) => void;
}

const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

function timeFormat(timezone: string) {
  return new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  });
}

function dayLabel(date: string, today: string): string {
  if (date === today) return "Hoy";
  if (date === addDays(today, 1)) return "Mañana";
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

/** «Lo antes posible» (si el local está abierto) o una hora concreta entre las que ofrece el servidor. */
export function ScheduleSection({ type, settings, value, onChange }: ScheduleSectionProps) {
  const first = useQuery({
    queryKey: ["slots", type, "today"],
    queryFn: () => fetchSlots(type),
    refetchInterval: 60_000,
  });
  const today = first.data?.date ?? null;
  const date = value.date ?? today;
  const selected = useQuery({
    queryKey: ["slots", type, date],
    queryFn: () => fetchSlots(type, date ?? undefined),
    enabled: date !== null && date !== today,
  });
  const slots = date === today ? first.data : selected.data;

  if (first.isError) {
    return (
      <p role="alert" className="text-destructive text-sm font-medium">
        No hemos podido cargar los horarios. Recarga la página.
      </p>
    );
  }
  if (!first.data || !today)
    return <p className="text-muted-foreground text-sm">Cargando horarios…</p>;

  const asap = first.data.asapAvailable;
  const days = Array.from({ length: settings.maxAdvanceDays + 1 }, (_, index) =>
    addDays(today, index),
  );
  const format = timeFormat(settings.timezone);
  const leadMinutes = type === "PICKUP" ? settings.prepTimeMinutes : settings.deliveryTimeMinutes;

  return (
    <div className="space-y-4">
      <label
        className={cn(
          "border-border flex min-h-11 items-start gap-3 rounded-lg border p-3 text-sm",
          asap ? "cursor-pointer" : "cursor-not-allowed opacity-60",
          value.mode === "asap" && asap && "border-tomato-strong bg-cream-soft",
        )}
      >
        <input
          type="radio"
          name="when"
          checked={value.mode === "asap" && asap}
          disabled={!asap}
          onChange={() => onChange({ mode: "asap", date: null, slot: null })}
          className="accent-tomato-strong mt-0.5 size-5"
        />
        <span>
          <span className="font-semibold">Lo antes posible</span>
          <span className="text-muted-foreground block">
            {asap ? `Unos ${leadMinutes} minutos` : "El local está cerrado ahora: elige una hora."}
          </span>
        </span>
      </label>

      <div
        className={cn(
          "border-border space-y-3 rounded-lg border p-3",
          (value.mode === "slot" || !asap) && "border-tomato-strong bg-cream-soft",
        )}
      >
        <label className="flex items-center gap-3 text-sm font-semibold">
          <input
            type="radio"
            name="when"
            checked={value.mode === "slot" || !asap}
            onChange={() => onChange({ mode: "slot", date: value.date ?? today, slot: null })}
            className="accent-tomato-strong size-5"
          />
          Elegir una hora
        </label>

        {value.mode === "slot" || !asap ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Día">
              {days.map((day) => (
                <button
                  key={day}
                  type="button"
                  aria-pressed={day === date}
                  onClick={() => onChange({ mode: "slot", date: day, slot: null })}
                  className={cn(
                    "border-foreground/40 min-h-11 rounded-full border px-4 text-sm font-semibold capitalize",
                    day === date && "bg-charcoal text-cream border-charcoal",
                  )}
                >
                  {dayLabel(day, today)}
                </button>
              ))}
            </div>

            {slots === undefined ? (
              <p className="text-muted-foreground text-sm">Cargando horas…</p>
            ) : slots.slots.length === 0 ? (
              <p className="text-muted-foreground text-sm">No hay horas disponibles este día.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="group" aria-label="Hora">
                {slots.slots.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    aria-pressed={value.slot === slot}
                    onClick={() => onChange({ mode: "slot", date, slot })}
                    className={cn(
                      "border-foreground/40 min-h-11 rounded-lg border text-sm font-semibold tabular-nums",
                      value.slot === slot && "bg-tomato-strong border-tomato-strong text-white",
                    )}
                  >
                    {format.format(new Date(slot))}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
