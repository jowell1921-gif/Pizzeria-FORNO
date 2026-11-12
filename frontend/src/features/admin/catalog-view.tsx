"use client";

import { useState, type FormEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useProfile } from "@/features/account/profile-context";
import { formatEuro } from "@/lib/format";

import {
  deleteCategory,
  deleteProduct,
  fetchAllergens,
  fetchCategories,
  fetchProducts,
  restoreProduct,
  saveCategory,
  saveProduct,
  uploadProductImage,
  type AdminCategory,
  type AdminProduct,
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
  adminErrorMessage,
  fieldClass,
  useAdminMutation,
  EditButton,
  useAdminQuery,
} from "./admin-ui";

const KINDS = [
  { id: "SIZE", label: "Tamaño" },
  { id: "DOUGH", label: "Masa" },
  { id: "EXTRA_INGREDIENT", label: "Ingrediente extra" },
  { id: "EXTRA", label: "Extra" },
] as const;

type Kind = (typeof KINDS)[number]["id"];

interface OptionDraft {
  id?: string;
  name: string;
  priceDelta: string;
  isDefault: boolean;
  available: boolean;
}
interface GroupDraft {
  id?: string;
  name: string;
  kind: Kind;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  options: OptionDraft[];
}

/** Carta: productos (con opciones, alérgenos, foto y disponibilidad) y categorías. */
export function CatalogView() {
  const [tab, setTab] = useState<"products" | "categories">("products");
  return (
    <div className="space-y-6">
      <PageTitle>Carta</PageTitle>
      <Tabs
        label="Sección de la carta"
        tabs={[
          { id: "products", label: "Productos" },
          { id: "categories", label: "Categorías" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "products" ? <ProductsSection /> : <CategoriesSection />}
    </div>
  );
}

function ProductsSection() {
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<AdminProduct | "new" | null>(null);
  const query = useAdminQuery(["products", status, q], (token) =>
    fetchProducts(token, { status, q }),
  );
  const toggle = useAdminMutation(
    (token, product: AdminProduct) =>
      saveProduct(token, product.id, { available: !product.available }),
    "products",
  );
  const remove = useAdminMutation(
    (token, product: AdminProduct) =>
      product.deleted
        ? restoreProduct(token, product.id).then(() => undefined)
        : deleteProduct(token, product.id),
    "products",
  );

  if (editing) {
    return (
      <ProductEditor
        key={editing === "new" ? "new" : editing.id}
        product={editing === "new" ? null : editing}
        onClose={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setQ(search.trim());
        }}
        className="grid gap-3 sm:grid-cols-[2fr_1fr_auto_auto]"
      >
        <Field label="Buscar producto">
          {(id) => (
            <input
              id={id}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className={fieldClass}
            />
          )}
        </Field>
        <Field label="Estado">
          {(id) => (
            <select
              id={id}
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className={fieldClass}
            >
              <option value="all">Todos</option>
              <option value="available">Disponibles</option>
              <option value="unavailable">No disponibles</option>
              <option value="deleted">Borrados</option>
            </select>
          )}
        </Field>
        <div className="flex items-end">
          <Button type="submit" variant="outline" className="h-11 w-full">
            Buscar
          </Button>
        </div>
        <div className="flex items-end">
          <EditButton type="button" className="h-11 w-full" onClick={() => setEditing("new")}>
            Nuevo producto
          </EditButton>
        </div>
      </form>

      <QueryState query={query}>
        {query.data && query.data.length === 0 ? (
          <p className="border-border text-muted-foreground rounded-xl border border-dashed p-6 text-center">
            No hay productos con estos filtros.
          </p>
        ) : (
          <ul className="space-y-2" aria-label="Productos">
            {query.data?.map((product) => (
              <li
                key={product.id}
                className="border-border bg-card grid items-center gap-3 rounded-xl border p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
              >
                <div className="min-w-0">
                  <p className="truncate font-bold">{product.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {product.categoryName} · {formatEuro(product.basePrice)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {product.deleted ? <Badge variant="secondary">Borrado</Badge> : null}
                  {!product.deleted && !product.available ? (
                    <Badge variant="secondary">No disponible</Badge>
                  ) : null}
                  {product.popular ? <Badge>Popular</Badge> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {product.deleted ? null : (
                    <>
                      <EditButton
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={`Editar ${product.name}`}
                        onClick={() => setEditing(product)}
                      >
                        Editar
                      </EditButton>
                      <EditButton
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={`${product.available ? "Marcar agotado" : "Marcar disponible"}: ${product.name}`}
                        onClick={() => toggle.mutate(product)}
                      >
                        {product.available ? "Agotado" : "Disponible"}
                      </EditButton>
                    </>
                  )}
                  <EditButton
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`${product.deleted ? "Restaurar" : "Borrar"} ${product.name}`}
                    onClick={() => remove.mutate(product)}
                  >
                    {product.deleted ? "Restaurar" : "Borrar"}
                  </EditButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
      <Feedback error={toggle.error ?? remove.error} />
    </div>
  );
}

const blankGroup = (): GroupDraft => ({
  name: "",
  kind: "EXTRA",
  required: false,
  minSelect: 0,
  maxSelect: 1,
  options: [{ name: "", priceDelta: "0.00", isDefault: false, available: true }],
});

function ProductEditor({
  product,
  onClose,
}: {
  product: AdminProduct | null;
  onClose: () => void;
}) {
  const { token } = useProfile();
  const categories = useAdminQuery(["categories"], fetchCategories);
  const allergens = useAdminQuery(["allergens"], fetchAllergens);
  const [form, setForm] = useState({
    categoryId: product?.categoryId ?? "",
    name: product?.name ?? "",
    description: product?.description ?? "",
    basePrice: product?.basePrice ?? "0.00",
    taxRate: product?.taxRate ?? "10.00",
    vegetarian: product?.vegetarian ?? false,
    available: product?.available ?? true,
    popular: product?.popular ?? false,
    sortOrder: String(product?.sortOrder ?? 0),
    ingredients: (product?.ingredients ?? []).join(", "),
    allergens: product?.allergens ?? [],
    imageUrl: product?.image?.url ?? "",
    imageAlt: product?.image?.alt ?? "",
  });
  const [groups, setGroups] = useState<GroupDraft[]>(
    (product?.optionGroups ?? []).map((group) => ({
      id: group.id,
      name: group.name,
      kind: group.kind,
      required: group.required,
      minSelect: group.minSelect,
      maxSelect: group.maxSelect,
      options: group.options.map((option) => ({ ...option })),
    })),
  );
  const [uploadError, setUploadError] = useState<unknown>(null);
  const [uploading, setUploading] = useState(false);

  const mutation = useAdminMutation(
    (auth, body: Record<string, unknown>) => saveProduct(auth, product?.id ?? null, body),
    "products",
    onClose,
  );
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const updateGroup = (index: number, patch: Partial<GroupDraft>) =>
    setGroups((current) => current.map((g, i) => (i === index ? { ...g, ...patch } : g)));
  const updateOption = (groupIndex: number, optionIndex: number, patch: Partial<OptionDraft>) =>
    setGroups((current) =>
      current.map((g, i) =>
        i === groupIndex
          ? { ...g, options: g.options.map((o, j) => (j === optionIndex ? { ...o, ...patch } : o)) }
          : g,
      ),
    );

  async function upload(file: File | undefined) {
    if (!file || !token) return;
    setUploading(true);
    setUploadError(null);
    try {
      set("imageUrl", await uploadProductImage(token, file));
    } catch (error) {
      setUploadError(error);
    } finally {
      setUploading(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate({
      categoryId: form.categoryId,
      name: form.name.trim(),
      description: form.description.trim(),
      basePrice: form.basePrice.trim(),
      taxRate: form.taxRate.trim(),
      vegetarian: form.vegetarian,
      available: form.available,
      popular: form.popular,
      sortOrder: Number(form.sortOrder) || 0,
      ingredients: form.ingredients
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      allergens: form.allergens,
      image: form.imageUrl.trim() ? { url: form.imageUrl.trim(), alt: form.imageAlt.trim() } : null,
      optionGroups: groups.map((group) => ({
        ...(group.id ? { id: group.id } : {}),
        name: group.name.trim(),
        kind: group.kind,
        required: group.required,
        minSelect: group.minSelect,
        maxSelect: group.maxSelect,
        options: group.options.map((option) => ({
          ...(option.id ? { id: option.id } : {}),
          name: option.name.trim(),
          priceDelta: option.priceDelta.trim() || "0.00",
          isDefault: option.isDefault,
          available: option.available,
        })),
      })),
    });
  }

  return (
    <form noValidate onSubmit={submit} className="space-y-6" aria-label="Editor de producto">
      <Section title={product ? `Editar: ${product.name}` : "Nuevo producto"}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre">
            {(id) => (
              <input
                id={id}
                value={form.name}
                onChange={(event) => set("name", event.target.value)}
                className={fieldClass}
              />
            )}
          </Field>
          <Field label="Categoría">
            {(id) => (
              <select
                id={id}
                value={form.categoryId}
                onChange={(event) => set("categoryId", event.target.value)}
                className={fieldClass}
              >
                <option value="">Elige una categoría…</option>
                {categories.data?.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Descripción" className="sm:col-span-2">
            {(id) => (
              <textarea
                id={id}
                value={form.description}
                rows={3}
                maxLength={400}
                onChange={(event) => set("description", event.target.value)}
                className="border-border bg-background w-full rounded-lg border p-3 text-sm"
              />
            )}
          </Field>
          <Field label="Precio (€, IVA incluido)">
            {(id) => (
              <input
                id={id}
                inputMode="decimal"
                value={form.basePrice}
                onChange={(event) => set("basePrice", event.target.value)}
                className={fieldClass}
              />
            )}
          </Field>
          <Field label="IVA (%)">
            {(id) => (
              <input
                id={id}
                inputMode="decimal"
                value={form.taxRate}
                onChange={(event) => set("taxRate", event.target.value)}
                className={fieldClass}
              />
            )}
          </Field>
          <Field label="Orden de aparición">
            {(id) => (
              <input
                id={id}
                type="number"
                min={0}
                value={form.sortOrder}
                onChange={(event) => set("sortOrder", event.target.value)}
                className={fieldClass}
              />
            )}
          </Field>
          <Field label="Ingredientes" hint="Separados por comas.">
            {(id) => (
              <input
                id={id}
                value={form.ingredients}
                onChange={(event) => set("ingredients", event.target.value)}
                className={fieldClass}
              />
            )}
          </Field>
        </div>
        <div className="flex flex-wrap gap-x-6">
          <Check
            label="Disponible"
            checked={form.available}
            onChange={(v) => set("available", v)}
          />
          <Check
            label="Popular (portada)"
            checked={form.popular}
            onChange={(v) => set("popular", v)}
          />
          <Check
            label="Vegetariano"
            checked={form.vegetarian}
            onChange={(v) => set("vegetarian", v)}
          />
        </div>
      </Section>

      <Section title="Alérgenos">
        <QueryState query={allergens}>
          <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
            {allergens.data?.map((allergen) => (
              <Check
                key={allergen.code}
                label={allergen.name}
                checked={form.allergens.includes(allergen.code)}
                onChange={(value) =>
                  set(
                    "allergens",
                    value
                      ? [...form.allergens, allergen.code]
                      : form.allergens.filter((code) => code !== allergen.code),
                  )
                }
              />
            ))}
          </div>
        </QueryState>
      </Section>

      <Section title="Fotografía">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Ruta o URL de la imagen"
            hint="Por ejemplo /image/margherita.webp o una URL https."
          >
            {(id) => (
              <input
                id={id}
                value={form.imageUrl}
                onChange={(event) => set("imageUrl", event.target.value)}
                className={fieldClass}
              />
            )}
          </Field>
          <Field label="Texto alternativo">
            {(id) => (
              <input
                id={id}
                value={form.imageAlt}
                onChange={(event) => set("imageAlt", event.target.value)}
                className={fieldClass}
              />
            )}
          </Field>
          <Field label="Subir una foto (JPEG, PNG o WebP, máx. 3 MB)">
            {(id) => (
              <input
                id={id}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={uploading}
                onChange={(event) => void upload(event.target.files?.[0])}
                className="w-full min-w-0 text-sm"
              />
            )}
          </Field>
        </div>
        {uploading ? <p className="text-muted-foreground text-sm">Subiendo…</p> : null}
        {uploadError ? (
          <p role="alert" className="text-destructive text-sm font-medium">
            {adminErrorMessage(uploadError)}
          </p>
        ) : null}
      </Section>

      <Section
        title="Opciones configurables"
        actions={
          <Button
            type="button"
            variant="outline"
            onClick={() => setGroups([...groups, blankGroup()])}
          >
            Añadir grupo
          </Button>
        }
      >
        {groups.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Sin opciones: el producto se vende tal cual.
          </p>
        ) : null}
        {groups.map((group, groupIndex) => (
          <fieldset
            key={group.id ?? `new-${groupIndex}`}
            className="border-border space-y-3 rounded-xl border p-4"
          >
            <legend className="px-1 text-sm font-bold">Grupo {groupIndex + 1}</legend>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Nombre del grupo">
                {(id) => (
                  <input
                    id={id}
                    value={group.name}
                    onChange={(event) => updateGroup(groupIndex, { name: event.target.value })}
                    className={fieldClass}
                  />
                )}
              </Field>
              <Field label="Tipo">
                {(id) => (
                  <select
                    id={id}
                    value={group.kind}
                    onChange={(event) =>
                      updateGroup(groupIndex, { kind: event.target.value as Kind })
                    }
                    className={fieldClass}
                  >
                    {KINDS.map((kind) => (
                      <option key={kind.id} value={kind.id}>
                        {kind.label}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="Mínimo a elegir">
                {(id) => (
                  <input
                    id={id}
                    type="number"
                    min={0}
                    value={group.minSelect}
                    onChange={(event) =>
                      updateGroup(groupIndex, { minSelect: Number(event.target.value) })
                    }
                    className={fieldClass}
                  />
                )}
              </Field>
              <Field label="Máximo a elegir">
                {(id) => (
                  <input
                    id={id}
                    type="number"
                    min={1}
                    value={group.maxSelect}
                    onChange={(event) =>
                      updateGroup(groupIndex, { maxSelect: Number(event.target.value) })
                    }
                    className={fieldClass}
                  />
                )}
              </Field>
            </div>
            <Check
              label="Obligatorio"
              checked={group.required}
              onChange={(value) => updateGroup(groupIndex, { required: value })}
            />
            <div className="space-y-2">
              {group.options.map((option, optionIndex) => (
                <div
                  key={option.id ?? `o-${optionIndex}`}
                  className="grid items-end gap-3 sm:grid-cols-[2fr_1fr_auto_auto_auto]"
                >
                  <Field label={`Opción ${optionIndex + 1} (grupo ${groupIndex + 1})`}>
                    {(id) => (
                      <input
                        id={id}
                        value={option.name}
                        onChange={(event) =>
                          updateOption(groupIndex, optionIndex, { name: event.target.value })
                        }
                        className={fieldClass}
                      />
                    )}
                  </Field>
                  <Field label="Suplemento (€)">
                    {(id) => (
                      <input
                        id={id}
                        inputMode="decimal"
                        value={option.priceDelta}
                        onChange={(event) =>
                          updateOption(groupIndex, optionIndex, { priceDelta: event.target.value })
                        }
                        className={fieldClass}
                      />
                    )}
                  </Field>
                  <Check
                    label="Por defecto"
                    checked={option.isDefault}
                    onChange={(value) =>
                      updateOption(groupIndex, optionIndex, { isDefault: value })
                    }
                  />
                  <Check
                    label="Disponible"
                    checked={option.available}
                    onChange={(value) =>
                      updateOption(groupIndex, optionIndex, { available: value })
                    }
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`Quitar opción ${optionIndex + 1} del grupo ${groupIndex + 1}`}
                    onClick={() =>
                      updateGroup(groupIndex, {
                        options: group.options.filter((_, j) => j !== optionIndex),
                      })
                    }
                  >
                    Quitar
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  updateGroup(groupIndex, {
                    options: [
                      ...group.options,
                      { name: "", priceDelta: "0.00", isDefault: false, available: true },
                    ],
                  })
                }
              >
                Añadir opción
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={`Quitar grupo ${groupIndex + 1}`}
                onClick={() => setGroups(groups.filter((_, i) => i !== groupIndex))}
              >
                Quitar grupo
              </Button>
            </div>
          </fieldset>
        ))}
      </Section>

      <SaveBar
        pending={mutation.isPending}
        error={mutation.error}
        label={product ? "Guardar producto" : "Crear producto"}
      >
        <Button type="button" variant="outline" size="lg" onClick={onClose}>
          Cancelar
        </Button>
      </SaveBar>
    </form>
  );
}

function CategoriesSection() {
  const query = useAdminQuery(["categories"], fetchCategories);
  const [editing, setEditing] = useState<AdminCategory | "new" | null>(null);
  const remove = useAdminMutation(
    (token, category: AdminCategory) => deleteCategory(token, category.id),
    "categories",
  );

  return (
    <Section
      title="Categorías"
      actions={
        <EditButton type="button" onClick={() => setEditing("new")}>
          Nueva categoría
        </EditButton>
      }
    >
      {editing ? (
        <CategoryForm
          key={editing === "new" ? "new" : editing.id}
          category={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
      <QueryState query={query}>
        <ul className="space-y-2" aria-label="Categorías">
          {query.data?.map((category) => (
            <li
              key={category.id}
              className="border-border flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
            >
              <div>
                <p className="font-bold">
                  {category.name}
                  {category.active ? "" : " (oculta)"}
                </p>
                <p className="text-muted-foreground text-xs">
                  {category.productCount} {category.productCount === 1 ? "producto" : "productos"} ·
                  orden {category.sortOrder}
                </p>
              </div>
              <div className="flex gap-2">
                <EditButton
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`Editar la categoría ${category.name}`}
                  onClick={() => setEditing(category)}
                >
                  Editar
                </EditButton>
                <EditButton
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`Borrar la categoría ${category.name}`}
                  onClick={() => remove.mutate(category)}
                >
                  Borrar
                </EditButton>
              </div>
            </li>
          ))}
        </ul>
      </QueryState>
      <Feedback error={remove.error} />
    </Section>
  );
}

function CategoryForm({
  category,
  onClose,
}: {
  category: AdminCategory | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [description, setDescription] = useState(category?.description ?? "");
  const [sortOrder, setSortOrder] = useState(String(category?.sortOrder ?? 0));
  const [active, setActive] = useState(category?.active ?? true);
  const mutation = useAdminMutation(
    (token, body: Record<string, unknown>) => saveCategory(token, category?.id ?? null, body),
    "categories",
    onClose,
  );
  return (
    <form
      noValidate
      aria-label={category ? "Editar categoría" : "Nueva categoría"}
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate({
          name: name.trim(),
          description: description.trim() || null,
          sortOrder: Number(sortOrder) || 0,
          active,
        });
      }}
      className="border-border bg-cream-soft grid gap-3 rounded-xl border p-4 sm:grid-cols-2"
    >
      <Field label="Nombre">
        {(id) => (
          <input
            id={id}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={fieldClass}
          />
        )}
      </Field>
      <Field label="Orden">
        {(id) => (
          <input
            id={id}
            type="number"
            min={0}
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className={fieldClass}
          />
        )}
      </Field>
      <Field label="Descripción (opcional)" className="sm:col-span-2">
        {(id) => (
          <input
            id={id}
            value={description}
            maxLength={200}
            onChange={(e) => setDescription(e.target.value)}
            className={fieldClass}
          />
        )}
      </Field>
      <Check label="Visible en la carta" checked={active} onChange={setActive} />
      <div className="sm:col-span-2">
        <SaveBar
          pending={mutation.isPending}
          error={mutation.error}
          label={category ? "Guardar categoría" : "Crear categoría"}
        >
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
        </SaveBar>
      </div>
    </form>
  );
}
