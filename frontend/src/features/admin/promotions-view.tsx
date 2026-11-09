"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatEuro } from "@/lib/format";

import {
  createCoupon,
  deleteCoupon,
  deletePromotion,
  fetchProducts,
  fetchPromotions,
  savePromotion,
  updateCoupon,
  type AdminPromotion,
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
  fromDateInput,
  toDateInput,
  toInt,
  useAdminMutation,
  useAdminQuery,
} from "./admin-ui";

const dateFormat = new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" });

function describe(promotion: AdminPromotion) {
  if (promotion.kind === "COMBO") return `Combo a ${formatEuro(promotion.comboPrice ?? "0")}`;
  return promotion.discountType === "PERCENT"
    ? `${Number(promotion.discountValue)} % de descuento`
    : `${formatEuro(promotion.discountValue ?? "0")} de descuento`;
}

/** Promociones (descuentos y combos, con o sin código) y sus cupones. */
export function PromotionsView() {
  const query = useAdminQuery(["promotions"], fetchPromotions);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing =
    editingId === "new" ? "new" : (query.data?.find((item) => item.id === editingId) ?? null);
  const setEditing = (value: AdminPromotion | "new" | null) =>
    setEditingId(value === null ? null : value === "new" ? "new" : value.id);
  const remove = useAdminMutation(
    (token, promotion: AdminPromotion) => deletePromotion(token, promotion.id),
    "promotions",
  );

  if (editing) {
    return (
      <div className="space-y-6">
        <PageTitle>Promociones</PageTitle>
        <PromotionEditor
          key={editing === "new" ? "new" : editing.id}
          promotion={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageTitle>Promociones</PageTitle>
        <Button type="button" size="lg" onClick={() => setEditing("new")}>
          Nueva promoción
        </Button>
      </div>
      <QueryState query={query}>
        {query.data && query.data.length === 0 ? (
          <p className="border-border text-muted-foreground rounded-xl border border-dashed p-6 text-center">
            Todavía no hay promociones.
          </p>
        ) : (
          <ul className="space-y-3" aria-label="Promociones">
            {query.data?.map((promotion) => (
              <li
                key={promotion.id}
                className="border-border bg-card space-y-3 rounded-2xl border p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xl font-bold">{promotion.name}</p>
                    <p className="text-muted-foreground text-sm">
                      {describe(promotion)}
                      {promotion.endsAt
                        ? ` · hasta ${dateFormat.format(new Date(promotion.endsAt))}`
                        : ""}
                      {` · ${promotion.usage} ${promotion.usage === 1 ? "uso" : "usos"}`}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <Badge variant={promotion.active ? "default" : "secondary"}>
                        {promotion.active ? "Activa" : "Inactiva"}
                      </Badge>
                      {promotion.automatic ? <Badge variant="secondary">Automática</Badge> : null}
                      {promotion.coupons.length > 0 ? (
                        <Badge variant="secondary">
                          {promotion.coupons.length}{" "}
                          {promotion.coupons.length === 1 ? "cupón" : "cupones"}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={`Editar la promoción ${promotion.name}`}
                      onClick={() => setEditing(promotion)}
                    >
                      Editar
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={`Borrar la promoción ${promotion.name}`}
                      onClick={() => remove.mutate(promotion)}
                    >
                      Borrar
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
      <Feedback error={remove.error} />
    </div>
  );
}

interface ProductLine {
  productId: string;
  quantity: string;
}

function PromotionEditor({
  promotion,
  onClose,
}: {
  promotion: AdminPromotion | null;
  onClose: () => void;
}) {
  const products = useAdminQuery(["products", "all", ""], (token) =>
    fetchProducts(token, { status: "all", q: "" }),
  );
  const [form, setForm] = useState({
    name: promotion?.name ?? "",
    description: promotion?.description ?? "",
    badge: promotion?.badge ?? "",
    kind: promotion?.kind ?? "DISCOUNT",
    discountType: promotion?.discountType ?? "PERCENT",
    discountValue: promotion?.discountValue ?? "10",
    comboPrice: promotion?.comboPrice ?? "",
    minSubtotal: promotion?.minSubtotal ?? "",
    startsAt: toDateInput(promotion?.startsAt ?? null),
    endsAt: toDateInput(promotion?.endsAt ?? null),
    maxRedemptions: promotion?.maxRedemptions == null ? "" : String(promotion.maxRedemptions),
    perUserLimit: promotion?.perUserLimit == null ? "" : String(promotion.perUserLimit),
    firstOrderOnly: promotion?.firstOrderOnly ?? false,
    automatic: promotion?.automatic ?? false,
    active: promotion?.active ?? true,
    conditions: (promotion?.conditions ?? []).join("\n"),
  });
  const [lines, setLines] = useState<ProductLine[]>(
    (promotion?.products ?? []).map((line) => ({
      productId: line.productId,
      quantity: String(line.quantity),
    })),
  );
  const mutation = useAdminMutation(
    (token, body: Record<string, unknown>) => savePromotion(token, promotion?.id ?? null, body),
    "promotions",
  );
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const text = (
    key: "name" | "description" | "badge" | "minSubtotal" | "maxRedemptions" | "perUserLimit",
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
    <div className="space-y-6">
      <form
        noValidate
        aria-label="Editor de promoción"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate({
            name: form.name.trim(),
            description: form.description.trim(),
            badge: form.badge.trim() || null,
            kind: form.kind,
            ...(form.kind === "DISCOUNT"
              ? {
                  discountType: form.discountType,
                  discountValue: form.discountValue.trim(),
                  comboPrice: null,
                }
              : {
                  comboPrice: form.comboPrice.trim() || null,
                  discountType: null,
                  discountValue: null,
                }),
            minSubtotal: form.minSubtotal.trim() || null,
            startsAt: fromDateInput(form.startsAt),
            endsAt: fromDateInput(form.endsAt),
            maxRedemptions: toInt(form.maxRedemptions),
            perUserLimit: toInt(form.perUserLimit),
            firstOrderOnly: form.firstOrderOnly,
            automatic: form.automatic,
            active: form.active,
            conditions: form.conditions
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean),
            products: lines
              .filter((line) => line.productId)
              .map((line) => ({ productId: line.productId, quantity: Number(line.quantity) || 1 })),
          });
        }}
        className="space-y-6"
      >
        <Section title={promotion ? `Editar: ${promotion.name}` : "Nueva promoción"}>
          <div className="grid gap-4 sm:grid-cols-2">
            {text("name", "Nombre")}
            {text("badge", "Etiqueta (opcional)", "Por ejemplo «-20 %» o «Solo hoy».")}
            <Field label="Descripción" className="sm:col-span-2">
              {(id) => (
                <textarea
                  id={id}
                  rows={2}
                  value={form.description}
                  onChange={(event) => set("description", event.target.value)}
                  className="border-border bg-background w-full rounded-lg border p-3 text-sm"
                />
              )}
            </Field>
            <Field label="Tipo">
              {(id) => (
                <select
                  id={id}
                  value={form.kind}
                  onChange={(event) => set("kind", event.target.value as "DISCOUNT" | "COMBO")}
                  className={fieldClass}
                >
                  <option value="DISCOUNT">Descuento</option>
                  <option value="COMBO">Combo a precio cerrado</option>
                </select>
              )}
            </Field>
            {form.kind === "DISCOUNT" ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Descuento">
                  {(id) => (
                    <select
                      id={id}
                      value={form.discountType}
                      onChange={(event) =>
                        set("discountType", event.target.value as "PERCENT" | "FIXED")
                      }
                      className={fieldClass}
                    >
                      <option value="PERCENT">Porcentaje (%)</option>
                      <option value="FIXED">Importe fijo (€)</option>
                    </select>
                  )}
                </Field>
                <Field label="Valor">
                  {(id) => (
                    <input
                      id={id}
                      inputMode="decimal"
                      value={form.discountValue}
                      onChange={(event) => set("discountValue", event.target.value)}
                      className={fieldClass}
                    />
                  )}
                </Field>
              </div>
            ) : (
              <Field label="Precio del combo (€)">
                {(id) => (
                  <input
                    id={id}
                    inputMode="decimal"
                    value={form.comboPrice}
                    onChange={(event) => set("comboPrice", event.target.value)}
                    className={fieldClass}
                  />
                )}
              </Field>
            )}
            {text("minSubtotal", "Pedido mínimo (€, opcional)")}
            {text("maxRedemptions", "Usos máximos (opcional)")}
            {text("perUserLimit", "Usos por cliente (opcional)")}
            <Field label="Válida desde">
              {(id) => (
                <input
                  id={id}
                  type="date"
                  value={form.startsAt}
                  onChange={(event) => set("startsAt", event.target.value)}
                  className={fieldClass}
                />
              )}
            </Field>
            <Field label="Válida hasta">
              {(id) => (
                <input
                  id={id}
                  type="date"
                  value={form.endsAt}
                  onChange={(event) => set("endsAt", event.target.value)}
                  className={fieldClass}
                />
              )}
            </Field>
            <Field
              label="Condiciones"
              hint="Una por línea. Se muestran a los clientes."
              className="sm:col-span-2"
            >
              {(id) => (
                <textarea
                  id={id}
                  rows={3}
                  value={form.conditions}
                  onChange={(event) => set("conditions", event.target.value)}
                  className="border-border bg-background w-full rounded-lg border p-3 text-sm"
                />
              )}
            </Field>
          </div>
          <div className="flex flex-wrap gap-x-6">
            <Check label="Activa" checked={form.active} onChange={(v) => set("active", v)} />
            <Check
              label="Automática (se aplica sola, sin código)"
              checked={form.automatic}
              onChange={(v) => set("automatic", v)}
            />
            <Check
              label="Solo el primer pedido"
              checked={form.firstOrderOnly}
              onChange={(v) => set("firstOrderOnly", v)}
            />
          </div>
        </Section>

        <Section
          title={form.kind === "COMBO" ? "Productos del combo" : "Limitar a productos (opcional)"}
          actions={
            <Button
              type="button"
              variant="outline"
              onClick={() => setLines([...lines, { productId: "", quantity: "1" }])}
            >
              Añadir producto
            </Button>
          }
        >
          {lines.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {form.kind === "COMBO"
                ? "Añade los productos que forman el combo."
                : "Sin productos: el descuento se aplica a todo el pedido."}
            </p>
          ) : null}
          {lines.map((line, index) => (
            <div key={index} className="grid items-end gap-3 sm:grid-cols-[2fr_1fr_auto]">
              <Field label={`Producto ${index + 1}`}>
                {(id) => (
                  <select
                    id={id}
                    value={line.productId}
                    onChange={(event) =>
                      setLines(
                        lines.map((item, i) =>
                          i === index ? { ...item, productId: event.target.value } : item,
                        ),
                      )
                    }
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
              <Field label="Cantidad">
                {(id) => (
                  <input
                    id={id}
                    type="number"
                    min={1}
                    value={line.quantity}
                    onChange={(event) =>
                      setLines(
                        lines.map((item, i) =>
                          i === index ? { ...item, quantity: event.target.value } : item,
                        ),
                      )
                    }
                    className={fieldClass}
                  />
                )}
              </Field>
              <Button
                type="button"
                variant="outline"
                aria-label={`Quitar producto ${index + 1}`}
                onClick={() => setLines(lines.filter((_, i) => i !== index))}
              >
                Quitar
              </Button>
            </div>
          ))}
        </Section>

        <SaveBar
          pending={mutation.isPending}
          error={mutation.error}
          saved={mutation.isSuccess}
          label={promotion ? "Guardar promoción" : "Crear promoción"}
        >
          <Button type="button" variant="outline" size="lg" onClick={onClose}>
            {mutation.isSuccess ? "Volver" : "Cancelar"}
          </Button>
        </SaveBar>
      </form>

      {promotion ? <CouponsSection promotion={promotion} /> : null}
    </div>
  );
}

function CouponsSection({ promotion }: { promotion: AdminPromotion }) {
  const [code, setCode] = useState("");
  const [max, setMax] = useState("");
  const [perUser, setPerUser] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const create = useAdminMutation(
    (token, body: Record<string, unknown>) => createCoupon(token, promotion.id, body),
    "promotions",
    () => {
      setCode("");
      setMax("");
      setPerUser("");
      setEndsAt("");
    },
  );
  const toggle = useAdminMutation(
    (token, input: { id: string; active: boolean }) =>
      updateCoupon(token, input.id, { active: input.active }),
    "promotions",
  );
  const remove = useAdminMutation(
    (token, couponId: string) => deleteCoupon(token, couponId),
    "promotions",
  );

  return (
    <Section title="Cupones">
      <form
        noValidate
        aria-label="Nuevo cupón"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate({
            code: code.trim(),
            maxRedemptions: toInt(max),
            perUserLimit: toInt(perUser),
            endsAt: fromDateInput(endsAt),
          });
        }}
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <Field label="Código" hint="Letras, números, guiones (3-32).">
          {(id) => (
            <input
              id={id}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className={fieldClass}
            />
          )}
        </Field>
        <Field label="Usos máximos">
          {(id) => (
            <input
              id={id}
              type="number"
              min={1}
              value={max}
              onChange={(event) => setMax(event.target.value)}
              className={fieldClass}
            />
          )}
        </Field>
        <Field label="Usos por cliente">
          {(id) => (
            <input
              id={id}
              type="number"
              min={1}
              value={perUser}
              onChange={(event) => setPerUser(event.target.value)}
              className={fieldClass}
            />
          )}
        </Field>
        <Field label="Caduca el">
          {(id) => (
            <input
              id={id}
              type="date"
              value={endsAt}
              onChange={(event) => setEndsAt(event.target.value)}
              className={fieldClass}
            />
          )}
        </Field>
        <div className="sm:col-span-2 lg:col-span-4">
          <SaveBar
            pending={create.isPending}
            error={create.error}
            saved={create.isSuccess}
            label="Crear cupón"
          />
        </div>
      </form>
      {promotion.coupons.length === 0 ? (
        <p className="text-muted-foreground text-sm">Esta promoción no tiene cupones.</p>
      ) : (
        <ul className="space-y-2" aria-label="Cupones de la promoción">
          {promotion.coupons.map((coupon) => (
            <li
              key={coupon.id}
              className="border-border flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
            >
              <span>
                <strong className="font-mono">{coupon.code}</strong>{" "}
                <span className="text-muted-foreground text-sm">
                  · {coupon.usage} {coupon.usage === 1 ? "uso" : "usos"}
                  {coupon.maxRedemptions ? ` de ${coupon.maxRedemptions}` : ""}
                  {coupon.active ? "" : " · desactivado"}
                </span>
              </span>
              <span className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`${coupon.active ? "Desactivar" : "Activar"} el cupón ${coupon.code}`}
                  onClick={() => toggle.mutate({ id: coupon.id, active: !coupon.active })}
                >
                  {coupon.active ? "Desactivar" : "Activar"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`Borrar el cupón ${coupon.code}`}
                  onClick={() => remove.mutate(coupon.id)}
                >
                  Borrar
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <Feedback error={toggle.error ?? remove.error} />
    </Section>
  );
}
