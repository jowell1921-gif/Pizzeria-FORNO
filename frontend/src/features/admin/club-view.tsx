"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useProfile } from "@/features/account/profile-context";
import { formatEuro } from "@/lib/format";

import {
  adjustPoints,
  deleteReward,
  fetchCustomers,
  fetchLoyaltySettings,
  fetchProducts,
  fetchRedemptions,
  fetchRewards,
  fetchTransactions,
  saveLoyaltySettings,
  saveReward,
  type AdminReward,
} from "./admin-api";
import {
  Check,
  Feedback,
  Field,
  PageTitle,
  QueryState,
  SaveBar,
  Section,
  Tabs,
  fieldClass,
  fromDateInput,
  toDateInput,
  toInt,
  useAdminMutation,
  useAdminQuery,
} from "./admin-ui";

const dateTime = new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short" });

const TYPE_LABELS = {
  EARN: "Acumulación",
  REDEEM: "Canje",
  REVERSAL: "Reversión",
  ADJUSTMENT: "Ajuste",
  EXPIRATION: "Caducidad",
} as const;

const STATUS_LABELS = {
  AVAILABLE: "Disponible",
  USED: "Usado",
  CANCELLED: "Cancelado",
  EXPIRED: "Caducado",
} as const;

type Tab = "rule" | "rewards" | "movements" | "redemptions" | "customers";

/** Administración de FORNEA CLUB: regla de puntos, recompensas, movimientos, canjes y ajustes. */
export function ClubView() {
  const { profile } = useProfile();
  const [tab, setTab] = useState<Tab>("rule");
  const canManage = profile?.permissions.includes("loyalty:manage") ?? false;
  const canSeeCustomers = profile?.permissions.includes("customers:read") ?? false;
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "rule", label: "Regla de puntos" },
    { id: "rewards", label: "Recompensas" },
    { id: "movements", label: "Movimientos" },
    { id: "redemptions", label: "Canjes" },
    ...(canSeeCustomers && canManage
      ? [{ id: "customers" as const, label: "Clientes y ajustes" }]
      : []),
  ];
  return (
    <div className="space-y-6">
      <PageTitle>FORNEA CLUB</PageTitle>
      <Tabs label="Sección de FORNEA CLUB" tabs={tabs} value={tab} onChange={setTab} />
      {tab === "rule" ? <RuleSection /> : null}
      {tab === "rewards" ? <RewardsSection /> : null}
      {tab === "movements" ? <MovementsSection /> : null}
      {tab === "redemptions" ? <RedemptionsSection /> : null}
      {tab === "customers" ? <CustomersSection /> : null}
    </div>
  );
}

function RuleSection() {
  const query = useAdminQuery(["loyalty", "settings"], fetchLoyaltySettings);
  const [points, setPoints] = useState<string | null>(null);
  const [expiry, setExpiry] = useState<string | null>(null);
  const mutation = useAdminMutation(
    (token, body: Record<string, unknown>) => saveLoyaltySettings(token, body),
    "loyalty",
  );
  return (
    <Section title="Regla de conversión">
      <QueryState query={query}>
        {query.data ? (
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              mutation.mutate({
                pointsPerEuro: (points ?? query.data.pointsPerEuro).trim(),
                expiryDays: toInt(
                  expiry ?? (query.data.expiryDays == null ? "" : String(query.data.expiryDays)),
                ),
              });
            }}
            className="space-y-4"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Puntos por cada euro gastado"
                hint="Solo cuenta el importe de productos (no envío ni descuentos). 0 desactiva la acumulación."
              >
                {(id) => (
                  <input
                    id={id}
                    inputMode="decimal"
                    value={points ?? query.data.pointsPerEuro}
                    onChange={(event) => setPoints(event.target.value)}
                    className={fieldClass}
                  />
                )}
              </Field>
              <Field label="Caducidad de los puntos (días)" hint="Vacío: los puntos no caducan.">
                {(id) => (
                  <input
                    id={id}
                    type="number"
                    min={1}
                    value={
                      expiry ?? (query.data.expiryDays == null ? "" : String(query.data.expiryDays))
                    }
                    onChange={(event) => setExpiry(event.target.value)}
                    className={fieldClass}
                  />
                )}
              </Field>
            </div>
            <SaveBar
              pending={mutation.isPending}
              error={mutation.error}
              saved={mutation.isSuccess}
            />
          </form>
        ) : null}
      </QueryState>
    </Section>
  );
}

function RewardsSection() {
  const query = useAdminQuery(["loyalty", "rewards"], fetchRewards);
  const [editing, setEditing] = useState<AdminReward | "new" | null>(null);
  const remove = useAdminMutation(
    (token, reward: AdminReward) => deleteReward(token, reward.id),
    "loyalty",
  );
  return (
    <Section
      title="Recompensas"
      actions={
        <Button type="button" onClick={() => setEditing("new")}>
          Nueva recompensa
        </Button>
      }
    >
      {editing ? (
        <RewardForm
          key={editing === "new" ? "new" : editing.id}
          reward={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
      <QueryState query={query}>
        <ul className="space-y-2" aria-label="Recompensas">
          {query.data?.map((reward) => (
            <li
              key={reward.id}
              className="border-border flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
            >
              <div className="min-w-0">
                <p className="font-bold">
                  {reward.name}{" "}
                  <span className="text-muted-foreground">· {reward.pointsCost} pts</span>
                </p>
                <p className="text-muted-foreground text-xs">
                  {reward.freeProduct
                    ? `Producto gratis: ${reward.freeProduct.name}`
                    : `Descuento de ${formatEuro(reward.discountAmount ?? "0")}`}
                  {reward.stock != null ? ` · stock ${reward.stock}` : ""} · {reward.redemptions}{" "}
                  canjes
                </p>
                {reward.active ? null : <Badge variant="secondary">Inactiva</Badge>}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`Editar la recompensa ${reward.name}`}
                  onClick={() => setEditing(reward)}
                >
                  Editar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`Borrar la recompensa ${reward.name}`}
                  onClick={() => remove.mutate(reward)}
                >
                  Borrar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </QueryState>
      <Feedback error={remove.error} />
    </Section>
  );
}

function RewardForm({ reward, onClose }: { reward: AdminReward | null; onClose: () => void }) {
  const products = useAdminQuery(["products", "all", ""], (token) =>
    fetchProducts(token, { status: "all", q: "" }),
  );
  const [form, setForm] = useState({
    name: reward?.name ?? "",
    description: reward?.description ?? "",
    pointsCost: String(reward?.pointsCost ?? 100),
    mode: reward?.discountAmount ? "discount" : "product",
    freeProductId: reward?.freeProduct?.id ?? "",
    discountAmount: reward?.discountAmount ?? "",
    stock: reward?.stock == null ? "" : String(reward.stock),
    validFrom: toDateInput(reward?.validFrom ?? null),
    validTo: toDateInput(reward?.validTo ?? null),
    sortOrder: String(reward?.sortOrder ?? 0),
    active: reward?.active ?? true,
  });
  const mutation = useAdminMutation(
    (token, body: Record<string, unknown>) => saveReward(token, reward?.id ?? null, body),
    "loyalty",
    onClose,
  );
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const text = (
    key: "name" | "description" | "pointsCost" | "stock" | "sortOrder",
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
      aria-label={reward ? "Editar recompensa" : "Nueva recompensa"}
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate({
          name: form.name.trim(),
          description: form.description.trim() || null,
          pointsCost: Number(form.pointsCost),
          freeProductId: form.mode === "product" ? form.freeProductId || null : null,
          discountAmount: form.mode === "discount" ? form.discountAmount.trim() || null : null,
          stock: toInt(form.stock),
          validFrom: fromDateInput(form.validFrom),
          validTo: fromDateInput(form.validTo),
          sortOrder: Number(form.sortOrder) || 0,
          active: form.active,
        });
      }}
      className="border-border bg-cream-soft grid gap-3 rounded-xl border p-4 sm:grid-cols-2"
    >
      {text("name", "Nombre")}
      {text("pointsCost", "Puntos necesarios")}
      {text("description", "Descripción (opcional)")}
      <Field label="Tipo de premio">
        {(id) => (
          <select
            id={id}
            value={form.mode}
            onChange={(event) => set("mode", event.target.value)}
            className={fieldClass}
          >
            <option value="product">Producto gratis</option>
            <option value="discount">Descuento fijo (€)</option>
          </select>
        )}
      </Field>
      {form.mode === "product" ? (
        <Field label="Producto gratis">
          {(id) => (
            <select
              id={id}
              value={form.freeProductId}
              onChange={(event) => set("freeProductId", event.target.value)}
              className={fieldClass}
            >
              <option value="">Elige un producto…</option>
              {products.data?.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      ) : (
        <Field label="Descuento (€)">
          {(id) => (
            <input
              id={id}
              inputMode="decimal"
              value={form.discountAmount}
              onChange={(event) => set("discountAmount", event.target.value)}
              className={fieldClass}
            />
          )}
        </Field>
      )}
      {text("stock", "Existencias (opcional)", "Vacío: sin límite.")}
      {text("sortOrder", "Orden")}
      <Field label="Válida desde">
        {(id) => (
          <input
            id={id}
            type="date"
            value={form.validFrom}
            onChange={(event) => set("validFrom", event.target.value)}
            className={fieldClass}
          />
        )}
      </Field>
      <Field label="Válida hasta">
        {(id) => (
          <input
            id={id}
            type="date"
            value={form.validTo}
            onChange={(event) => set("validTo", event.target.value)}
            className={fieldClass}
          />
        )}
      </Field>
      <Check label="Activa" checked={form.active} onChange={(value) => set("active", value)} />
      <div className="sm:col-span-2">
        <SaveBar
          pending={mutation.isPending}
          error={mutation.error}
          label={reward ? "Guardar recompensa" : "Crear recompensa"}
        >
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
        </SaveBar>
      </div>
    </form>
  );
}

/** Lista paginada genérica con consulta propia (movimientos, canjes, clientes). */
function usePaged<T>(
  key: string,
  query: Record<string, string | number>,
  load: (
    token: string,
    query: Record<string, string | number>,
  ) => Promise<{
    data: T[];
    meta: { page: number; totalPages: number; total: number };
  }>,
) {
  const { token } = useProfile();
  return useQuery({
    queryKey: ["admin-data", "loyalty", key, query],
    queryFn: () => load(token ?? "", query),
    enabled: token !== null,
    placeholderData: keepPreviousData,
  });
}

function Pager({
  page,
  meta,
  onPage,
}: {
  page: number;
  meta: { totalPages: number; total: number } | undefined;
  onPage: (page: number) => void;
}) {
  if (!meta || meta.totalPages <= 1) return null;
  return (
    <nav aria-label="Paginación" className="flex items-center justify-between gap-3">
      <Button type="button" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Anterior
      </Button>
      <p className="text-muted-foreground text-sm">
        Página {page} de {meta.totalPages} · {meta.total} registros
      </p>
      <Button
        type="button"
        variant="outline"
        disabled={page >= meta.totalPages}
        onClick={() => onPage(page + 1)}
      >
        Siguiente
      </Button>
    </nav>
  );
}

function MovementsSection() {
  const [type, setType] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const query = usePaged(
    "transactions",
    { page, pageSize: 15, ...(type ? { type } : {}), ...(q ? { q } : {}) },
    fetchTransactions,
  );
  return (
    <Section title="Libro de movimientos">
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setQ(search.trim());
          setPage(1);
        }}
        className="grid gap-3 sm:grid-cols-[2fr_1fr_auto]"
      >
        <Field label="Buscar cliente">
          {(id) => (
            <input
              id={id}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nombre o correo"
              className={fieldClass}
            />
          )}
        </Field>
        <Field label="Tipo">
          {(id) => (
            <select
              id={id}
              value={type}
              onChange={(event) => {
                setType(event.target.value);
                setPage(1);
              }}
              className={fieldClass}
            >
              <option value="">Todos</option>
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <div className="flex items-end">
          <Button type="submit" variant="outline" className="h-11 w-full">
            Buscar
          </Button>
        </div>
      </form>
      <QueryState query={query}>
        {query.data && query.data.data.length === 0 ? (
          <p className="text-muted-foreground text-sm">No hay movimientos.</p>
        ) : (
          <ul className="space-y-2" aria-label="Movimientos">
            {query.data?.data.map((row) => (
              <li
                key={row.id}
                className="border-border grid gap-1 rounded-xl border p-3 sm:grid-cols-[1fr_auto]"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {row.customer.fullName}{" "}
                    <span className="text-muted-foreground text-xs">{row.customer.email}</span>
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {TYPE_LABELS[row.type]}
                    {row.orderNumber ? ` · pedido #${row.orderNumber}` : ""}
                    {row.reason ? ` · ${row.reason}` : ""} ·{" "}
                    {dateTime.format(new Date(row.createdAt))}
                    {row.createdBy ? ` · por ${row.createdBy}` : ""}
                  </p>
                </div>
                <p className="font-bold sm:text-right">
                  {row.points > 0 ? "+" : ""}
                  {row.points} pts
                  <span className="text-muted-foreground block text-xs font-normal">
                    saldo {row.balanceAfter}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
      <Pager page={page} meta={query.data?.meta} onPage={setPage} />
    </Section>
  );
}

function RedemptionsSection() {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const query = usePaged(
    "redemptions",
    { page, pageSize: 15, ...(status ? { status } : {}) },
    fetchRedemptions,
  );
  return (
    <Section title="Canjes">
      <Field label="Estado" className="max-w-xs">
        {(id) => (
          <select
            id={id}
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            className={fieldClass}
          >
            <option value="">Todos</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        )}
      </Field>
      <QueryState query={query}>
        {query.data && query.data.data.length === 0 ? (
          <p className="text-muted-foreground text-sm">No hay canjes.</p>
        ) : (
          <ul className="space-y-2" aria-label="Canjes">
            {query.data?.data.map((row) => (
              <li
                key={row.id}
                className="border-border flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3"
              >
                <div className="min-w-0">
                  <p className="font-semibold">
                    {row.rewardName} · {row.pointsSpent} pts
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {row.customer.fullName} · {row.customer.email} ·{" "}
                    {dateTime.format(new Date(row.createdAt))}
                    {row.orderNumber ? ` · pedido #${row.orderNumber}` : ""}
                  </p>
                </div>
                <Badge variant="secondary">{STATUS_LABELS[row.status]}</Badge>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
      <Pager page={page} meta={query.data?.meta} onPage={setPage} />
    </Section>
  );
}

function CustomersSection() {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null);
  const query = usePaged("customers", { page, pageSize: 10, ...(q ? { q } : {}) }, fetchCustomers);
  return (
    <Section title="Clientes y ajustes de puntos">
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setQ(search.trim());
          setPage(1);
        }}
        className="grid gap-3 sm:grid-cols-[2fr_auto]"
      >
        <Field label="Buscar cliente">
          {(id) => (
            <input
              id={id}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nombre, correo o teléfono"
              className={fieldClass}
            />
          )}
        </Field>
        <div className="flex items-end">
          <Button type="submit" variant="outline" className="h-11 w-full">
            Buscar
          </Button>
        </div>
      </form>
      {target ? (
        <AdjustForm key={target.id} customer={target} onClose={() => setTarget(null)} />
      ) : null}
      <QueryState query={query}>
        {query.data && query.data.data.length === 0 ? (
          <p className="text-muted-foreground text-sm">No hay clientes con ese criterio.</p>
        ) : (
          <ul className="space-y-2" aria-label="Clientes">
            {query.data?.data.map((customer) => (
              <li
                key={customer.id}
                className="border-border flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">{customer.fullName}</p>
                  <p className="text-muted-foreground text-xs">
                    {customer.email} · {customer.orders} pedidos · {customer.balance} pts
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`Ajustar puntos de ${customer.fullName}`}
                  onClick={() => setTarget({ id: customer.id, name: customer.fullName })}
                >
                  Ajustar puntos
                </Button>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
      <Pager page={page} meta={query.data?.meta} onPage={setPage} />
    </Section>
  );
}

function AdjustForm({
  customer,
  onClose,
}: {
  customer: { id: string; name: string };
  onClose: () => void;
}) {
  const [points, setPoints] = useState("");
  const [reason, setReason] = useState("");
  const mutation = useAdminMutation(
    (token, body: Record<string, unknown>) => adjustPoints(token, body),
    "loyalty",
  );
  return (
    <form
      noValidate
      aria-label={`Ajustar puntos de ${customer.name}`}
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate({ userId: customer.id, points: Number(points), reason: reason.trim() });
      }}
      className="border-border bg-cream-soft grid gap-3 rounded-xl border p-4 sm:grid-cols-2"
    >
      <p className="font-semibold sm:col-span-2">Ajuste para {customer.name}</p>
      <Field label="Puntos (negativos para restar)">
        {(id) => (
          <input
            id={id}
            type="number"
            value={points}
            onChange={(event) => setPoints(event.target.value)}
            className={fieldClass}
          />
        )}
      </Field>
      <Field label="Motivo (obligatorio, queda auditado)">
        {(id) => (
          <input
            id={id}
            value={reason}
            maxLength={300}
            onChange={(event) => setReason(event.target.value)}
            className={fieldClass}
          />
        )}
      </Field>
      {mutation.data ? (
        <p role="status" className="text-sm font-medium text-green-700 sm:col-span-2">
          Ajuste aplicado. Nuevo saldo: {mutation.data.balance} puntos.
        </p>
      ) : null}
      <div className="sm:col-span-2">
        <SaveBar pending={mutation.isPending} error={mutation.error} label="Aplicar ajuste">
          <Button type="button" variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </SaveBar>
      </div>
    </form>
  );
}
