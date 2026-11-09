"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { formatEuro } from "@/lib/format";

import {
  createSpecialDay,
  deleteSpecialDay,
  deleteZone,
  fetchOpeningHours,
  fetchSpecialDays,
  fetchStoreSettings,
  fetchZones,
  saveOpeningHours,
  saveStoreSettings,
  saveZone,
  type AdminZone,
  type OpeningSlot,
  type StoreSettings,
} from "./admin-api";
import {
  Check,
  Feedback,
  Field,
  PageTitle,
  QueryState,
  SaveBar,
  Section,
  fieldClass,
  minutesToTime,
  timeToMinutes,
  useAdminMutation,
  useAdminQuery,
} from "./admin-ui";

const PAYMENT_LABELS = {
  ONLINE: "Pago online (tarjeta)",
  CASH_PICKUP: "Efectivo al recoger",
  CASH_DELIVERY: "Efectivo al recibir",
} as const;

const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

/** Ajustes del establecimiento: datos, tiempos, pedidos, pausa, pagos, horarios, festivos y reparto. */
export function StoreView() {
  const settings = useAdminQuery(["store", "settings"], fetchStoreSettings);
  return (
    <div className="space-y-6">
      <PageTitle>Establecimiento</PageTitle>
      <QueryState query={settings}>
        {settings.data ? (
          <>
            <PauseCard
              key={`pause-${String(settings.data.ordersPaused)}`}
              initial={settings.data}
            />
            <SettingsForm initial={settings.data} />
          </>
        ) : null}
      </QueryState>
      <HoursSection />
      <SpecialDaysSection />
      <ZonesSection />
    </div>
  );
}

function PauseCard({ initial }: { initial: StoreSettings }) {
  const [paused, setPaused] = useState(initial.ordersPaused);
  const [message, setMessage] = useState(initial.pausedMessage ?? "");
  const mutation = useAdminMutation(
    (token, body: Record<string, unknown>) => saveStoreSettings(token, body),
    "store",
  );
  return (
    <Section title="Pedidos online">
      <form
        noValidate
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          mutation.mutate({ ordersPaused: paused, pausedMessage: message.trim() || null });
        }}
        className="space-y-3"
      >
        <p className="text-muted-foreground text-sm">
          {initial.ordersPaused
            ? "Ahora mismo los pedidos están PAUSADOS: los clientes no pueden pedir."
            : "Los pedidos están activos."}
        </p>
        <Check label="Pausar la recepción de pedidos" checked={paused} onChange={setPaused} />
        <Field label="Mensaje para los clientes (opcional)">
          {(id) => (
            <input
              id={id}
              value={message}
              maxLength={200}
              onChange={(event) => setMessage(event.target.value)}
              className={fieldClass}
            />
          )}
        </Field>
        <SaveBar
          pending={mutation.isPending}
          error={mutation.error}
          saved={mutation.isSuccess}
          label="Aplicar"
        />
      </form>
    </Section>
  );
}

function SettingsForm({ initial }: { initial: StoreSettings }) {
  const [form, setForm] = useState({
    name: initial.name,
    legalName: initial.legalName ?? "",
    taxId: initial.taxId ?? "",
    addressLine: initial.addressLine,
    postalCode: initial.postalCode,
    city: initial.city,
    phone: initial.phone,
    email: initial.email,
    prepTimeMinutes: String(initial.prepTimeMinutes),
    deliveryTimeMinutes: String(initial.deliveryTimeMinutes),
    slotMinutes: String(initial.slotMinutes),
    maxAdvanceDays: String(initial.maxAdvanceDays),
    pickupEnabled: initial.pickupEnabled,
    deliveryEnabled: initial.deliveryEnabled,
    enabledPaymentMethods: initial.enabledPaymentMethods,
  });
  const mutation = useAdminMutation(
    (token, body: Record<string, unknown>) => saveStoreSettings(token, body),
    "store",
  );
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const text = (
    key: "name" | "addressLine" | "postalCode" | "city" | "phone" | "email" | "legalName" | "taxId",
    label: string,
    hint?: string,
  ) => (
    <Field label={label} {...(hint ? { hint } : {})}>
      {(id) => (
        <input
          id={id}
          value={form[key]}
          onChange={(event) => set(key, event.target.value)}
          className={fieldClass}
        />
      )}
    </Field>
  );
  const number = (
    key: "prepTimeMinutes" | "deliveryTimeMinutes" | "slotMinutes" | "maxAdvanceDays",
    label: string,
    hint?: string,
  ) => (
    <Field label={label} {...(hint ? { hint } : {})}>
      {(id) => (
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          value={form[key]}
          onChange={(event) => set(key, event.target.value)}
          className={fieldClass}
        />
      )}
    </Field>
  );

  function submit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate({
      name: form.name.trim(),
      legalName: form.legalName.trim() || null,
      taxId: form.taxId.trim() || null,
      addressLine: form.addressLine.trim(),
      postalCode: form.postalCode.trim(),
      city: form.city.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      prepTimeMinutes: Number(form.prepTimeMinutes),
      deliveryTimeMinutes: Number(form.deliveryTimeMinutes),
      slotMinutes: Number(form.slotMinutes),
      maxAdvanceDays: Number(form.maxAdvanceDays),
      pickupEnabled: form.pickupEnabled,
      deliveryEnabled: form.deliveryEnabled,
      enabledPaymentMethods: form.enabledPaymentMethods,
    });
  }

  return (
    <Section title="Datos y condiciones">
      <form noValidate onSubmit={submit} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {text("name", "Nombre comercial")}
          {text("phone", "Teléfono")}
          {text("addressLine", "Dirección")}
          {text("city", "Ciudad")}
          {text("postalCode", "Código postal")}
          {text("email", "Correo de contacto")}
          {text("legalName", "Razón social", "Aparece en facturas y tickets.")}
          {text("taxId", "NIF/CIF")}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {number("prepTimeMinutes", "Preparación (min)", "Tiempo estimado para recoger.")}
          {number("deliveryTimeMinutes", "Entrega (min)", "Tiempo estimado a domicilio.")}
          {number("slotMinutes", "Franja (min)", "Intervalo entre horas elegibles.")}
          {number("maxAdvanceDays", "Antelación máx. (días)", "Hasta cuándo se puede programar.")}
        </div>
        <fieldset className="space-y-1">
          <legend className="text-sm font-semibold">Modalidades</legend>
          <Check
            label="Recogida en el establecimiento"
            checked={form.pickupEnabled}
            onChange={(value) => set("pickupEnabled", value)}
          />
          <Check
            label="Entrega a domicilio"
            checked={form.deliveryEnabled}
            onChange={(value) => set("deliveryEnabled", value)}
          />
        </fieldset>
        <fieldset className="space-y-1">
          <legend className="text-sm font-semibold">Métodos de pago</legend>
          {(Object.keys(PAYMENT_LABELS) as Array<keyof typeof PAYMENT_LABELS>).map((method) => (
            <Check
              key={method}
              label={PAYMENT_LABELS[method]}
              checked={form.enabledPaymentMethods.includes(method)}
              onChange={(value) =>
                set(
                  "enabledPaymentMethods",
                  value
                    ? [...form.enabledPaymentMethods, method]
                    : form.enabledPaymentMethods.filter((item) => item !== method),
                )
              }
            />
          ))}
        </fieldset>
        <SaveBar pending={mutation.isPending} error={mutation.error} saved={mutation.isSuccess} />
      </form>
    </Section>
  );
}

function HoursSection() {
  const query = useAdminQuery(["store", "hours"], fetchOpeningHours);
  return (
    <Section title="Horario semanal">
      <QueryState query={query}>
        {query.data ? <HoursEditor key={JSON.stringify(query.data)} initial={query.data} /> : null}
      </QueryState>
    </Section>
  );
}

function HoursEditor({ initial }: { initial: OpeningSlot[] }) {
  const [slots, setSlots] = useState(initial);
  const mutation = useAdminMutation(
    (token, value: OpeningSlot[]) => saveOpeningHours(token, value),
    "store",
  );
  const update = (index: number, patch: Partial<OpeningSlot>) =>
    setSlots((current) => current.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)));

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate(slots);
      }}
      className="space-y-4"
    >
      {DAYS.map((day, dayIndex) => {
        const dayOfWeek = dayIndex + 1;
        const rows = slots
          .map((slot, index) => ({ slot, index }))
          .filter(({ slot }) => slot.dayOfWeek === dayOfWeek);
        return (
          <div key={day} className="border-border space-y-2 rounded-xl border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold">{day}</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setSlots((current) => [
                    ...current,
                    { dayOfWeek, openMinute: 13 * 60, closeMinute: 16 * 60 },
                  ])
                }
              >
                Añadir tramo
              </Button>
            </div>
            {rows.length === 0 ? (
              <p className="text-muted-foreground text-sm">Cerrado</p>
            ) : (
              rows.map(({ slot, index }) => (
                <div key={index} className="flex flex-wrap items-end gap-3">
                  <Field label="Abre">
                    {(id) => (
                      <input
                        id={id}
                        type="time"
                        value={minutesToTime(slot.openMinute)}
                        onChange={(event) =>
                          update(index, { openMinute: timeToMinutes(event.target.value) })
                        }
                        className={fieldClass}
                      />
                    )}
                  </Field>
                  <Field label="Cierra">
                    {(id) => (
                      <input
                        id={id}
                        type="time"
                        value={minutesToTime(slot.closeMinute % 1440)}
                        onChange={(event) => {
                          const minutes = timeToMinutes(event.target.value);
                          update(index, { closeMinute: minutes === 0 ? 1440 : minutes });
                        }}
                        className={fieldClass}
                      />
                    )}
                  </Field>
                  <Button
                    type="button"
                    variant="outline"
                    aria-label={`Quitar tramo de ${day}`}
                    onClick={() => setSlots((current) => current.filter((_, i) => i !== index))}
                  >
                    Quitar
                  </Button>
                </div>
              ))
            )}
          </div>
        );
      })}
      <SaveBar
        pending={mutation.isPending}
        error={mutation.error}
        saved={mutation.isSuccess}
        label="Guardar horario"
      />
    </form>
  );
}

function SpecialDaysSection() {
  const query = useAdminQuery(["store", "special-days"], fetchSpecialDays);
  const [date, setDate] = useState("");
  const [closed, setClosed] = useState(true);
  const [open, setOpen] = useState("13:00");
  const [close, setClose] = useState("16:00");
  const [note, setNote] = useState("");
  const create = useAdminMutation(
    (token, body: Record<string, unknown>) => createSpecialDay(token, body),
    "store",
    () => {
      setDate("");
      setNote("");
    },
  );
  const remove = useAdminMutation(
    (token, dayId: string) => deleteSpecialDay(token, dayId),
    "store",
  );

  return (
    <Section title="Festivos y horarios especiales">
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate({
            date,
            closed,
            ...(closed
              ? {}
              : { openMinute: timeToMinutes(open), closeMinute: timeToMinutes(close) || 1440 }),
            note: note.trim() || null,
          });
        }}
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <Field label="Fecha">
          {(id) => (
            <input
              id={id}
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className={fieldClass}
            />
          )}
        </Field>
        <Field label="Nota (opcional)">
          {(id) => (
            <input
              id={id}
              value={note}
              maxLength={120}
              onChange={(event) => setNote(event.target.value)}
              className={fieldClass}
            />
          )}
        </Field>
        <div className="sm:col-span-2">
          <Check label="Cerrado todo el día" checked={closed} onChange={setClosed} />
          {closed ? null : (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Abre">
                {(id) => (
                  <input
                    id={id}
                    type="time"
                    value={open}
                    onChange={(event) => setOpen(event.target.value)}
                    className={fieldClass}
                  />
                )}
              </Field>
              <Field label="Cierra">
                {(id) => (
                  <input
                    id={id}
                    type="time"
                    value={close}
                    onChange={(event) => setClose(event.target.value)}
                    className={fieldClass}
                  />
                )}
              </Field>
            </div>
          )}
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <SaveBar
            pending={create.isPending}
            error={create.error}
            saved={create.isSuccess}
            label="Añadir día"
          />
        </div>
      </form>
      <QueryState query={query}>
        {query.data && query.data.length > 0 ? (
          <ul className="space-y-2" aria-label="Días especiales">
            {query.data.map((day) => (
              <li
                key={day.id}
                className="border-border flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3"
              >
                <span>
                  <strong>{day.date}</strong> ·{" "}
                  {day.closed
                    ? "Cerrado"
                    : `${minutesToTime(day.openMinute ?? 0)}–${minutesToTime(day.closeMinute ?? 0)}`}
                  {day.note ? ` · ${day.note}` : ""}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`Quitar el día ${day.date}`}
                  onClick={() => remove.mutate(day.id)}
                >
                  Quitar
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">No hay días especiales.</p>
        )}
      </QueryState>
      <Feedback error={remove.error} />
    </Section>
  );
}

const EMPTY_ZONE = {
  name: "",
  postalCodes: "",
  deliveryFee: "0.00",
  minimumOrder: "0.00",
  estimatedMinutes: "40",
  active: true,
};

function ZonesSection() {
  const query = useAdminQuery(["store", "zones"], fetchZones);
  const [editing, setEditing] = useState<AdminZone | "new" | null>(null);
  const remove = useAdminMutation((token, zoneId: string) => deleteZone(token, zoneId), "store");

  return (
    <Section
      title="Zonas de reparto"
      actions={
        <Button type="button" onClick={() => setEditing("new")}>
          Nueva zona
        </Button>
      }
    >
      {editing ? (
        <ZoneForm
          key={editing === "new" ? "new" : editing.id}
          zone={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
      <QueryState query={query}>
        {query.data && query.data.length > 0 ? (
          <ul className="space-y-2" aria-label="Zonas">
            {query.data.map((zone) => (
              <li
                key={zone.id}
                className="border-border flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
              >
                <div className="min-w-0">
                  <p className="font-bold">
                    {zone.name}
                    {zone.active ? "" : " (inactiva)"}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    CP {zone.postalCodes.join(", ")} · envío {formatEuro(zone.deliveryFee)} · mínimo{" "}
                    {formatEuro(zone.minimumOrder)} · {zone.estimatedMinutes} min
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`Editar la zona ${zone.name}`}
                    onClick={() => setEditing(zone)}
                  >
                    Editar
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`Borrar la zona ${zone.name}`}
                    onClick={() => remove.mutate(zone.id)}
                  >
                    Borrar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">No hay zonas de reparto.</p>
        )}
      </QueryState>
      <Feedback error={remove.error} />
    </Section>
  );
}

function ZoneForm({ zone, onClose }: { zone: AdminZone | null; onClose: () => void }) {
  const [form, setForm] = useState(
    zone
      ? {
          name: zone.name,
          postalCodes: zone.postalCodes.join(", "),
          deliveryFee: zone.deliveryFee,
          minimumOrder: zone.minimumOrder,
          estimatedMinutes: String(zone.estimatedMinutes),
          active: zone.active,
        }
      : EMPTY_ZONE,
  );
  const mutation = useAdminMutation(
    (token, body: Record<string, unknown>) => saveZone(token, zone?.id ?? null, body),
    "store",
    onClose,
  );
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const input = (
    key: "name" | "postalCodes" | "deliveryFee" | "minimumOrder" | "estimatedMinutes",
    label: string,
    hint?: string,
  ) => (
    <Field label={label} {...(hint ? { hint } : {})}>
      {(id) => (
        <input
          id={id}
          value={form[key]}
          onChange={(event) => set(key, event.target.value)}
          className={fieldClass}
        />
      )}
    </Field>
  );

  return (
    <form
      noValidate
      aria-label={zone ? "Editar zona" : "Nueva zona"}
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate({
          name: form.name.trim(),
          postalCodes: form.postalCodes
            .split(/[\s,;]+/)
            .map((code) => code.trim())
            .filter(Boolean),
          deliveryFee: form.deliveryFee.trim(),
          minimumOrder: form.minimumOrder.trim(),
          estimatedMinutes: Number(form.estimatedMinutes),
          active: form.active,
        });
      }}
      className="border-border bg-cream-soft grid gap-3 rounded-xl border p-4 sm:grid-cols-2"
    >
      {input("name", "Nombre de la zona")}
      {input("postalCodes", "Códigos postales", "Separados por comas. Cada uno, en una sola zona.")}
      {input("deliveryFee", "Gastos de envío (€)")}
      {input("minimumOrder", "Pedido mínimo (€)")}
      {input("estimatedMinutes", "Tiempo estimado (min)")}
      <Check label="Zona activa" checked={form.active} onChange={(value) => set("active", value)} />
      <div className="sm:col-span-2">
        <SaveBar
          pending={mutation.isPending}
          error={mutation.error}
          label={zone ? "Guardar zona" : "Crear zona"}
        >
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
        </SaveBar>
      </div>
    </form>
  );
}
