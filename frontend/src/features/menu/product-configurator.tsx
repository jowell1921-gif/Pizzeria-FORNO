"use client";

import { ShoppingBag } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useCartStore, useCartUi } from "@/features/cart/cart-store";
import { QuantityStepper } from "@/features/cart/quantity-stepper";
import type { OptionGroup, Product } from "@/features/catalog/schemas";
import { formatEuro } from "@/lib/format";
import { fromCents, toCents } from "@/lib/money";
import { cn } from "@/lib/utils";

type Selection = Record<string, string[]>;

/** Opciones marcadas por defecto de cada grupo. */
function defaultSelection(groups: readonly OptionGroup[]): Selection {
  return Object.fromEntries(
    groups.map((group) => [
      group.id,
      group.options
        .filter((option) => option.isDefault && option.available)
        .map((option) => option.id),
    ]),
  );
}

const isRadio = (group: OptionGroup) => group.required && group.maxSelect === 1;
const minimum = (group: OptionGroup) => Math.max(group.minSelect, group.required ? 1 : 0);

const deltaLabel = (delta: string) => {
  const cents = toCents(delta);
  if (cents === 0) return "";
  return ` (${cents > 0 ? "+" : "-"}${formatEuro(fromCents(Math.abs(cents)))})`;
};

interface ProductConfiguratorProps {
  product: Product;
  /** Se llama tras añadir el producto (por ejemplo, para cerrar la ventana). */
  onAdded: () => void;
}

/**
 * Elección de tamaño, masa, ingredientes extra y cantidad, y botón «Añadir al pedido». El precio que
 * se muestra es una estimación para orientar: el importe real lo calcula el servidor.
 */
export function ProductConfigurator({ product, onAdded }: ProductConfiguratorProps) {
  const add = useCartStore((state) => state.add);
  const setCartOpen = useCartUi((state) => state.setOpen);
  const [selection, setSelection] = useState<Selection>(() =>
    defaultSelection(product.optionGroups),
  );
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");

  const chosen = product.optionGroups.flatMap((group) =>
    group.options.filter((option) => selection[group.id]?.includes(option.id)),
  );
  const unitCents = chosen.reduce(
    (sum, option) => sum + toCents(option.priceDelta),
    toCents(product.price),
  );
  const valid = product.optionGroups.every(
    (group) => (selection[group.id]?.length ?? 0) >= minimum(group),
  );

  function toggle(group: OptionGroup, optionId: string) {
    setSelection((current) => {
      const selected = current[group.id] ?? [];
      if (isRadio(group)) return { ...current, [group.id]: [optionId] };
      if (selected.includes(optionId)) {
        return { ...current, [group.id]: selected.filter((id) => id !== optionId) };
      }
      if (selected.length >= group.maxSelect) return current;
      return { ...current, [group.id]: [...selected, optionId] };
    });
  }

  function addToCart() {
    add({
      productId: product.id,
      name: product.name,
      imageUrl: product.image?.url ?? null,
      imageAlt: product.image?.alt ?? "",
      optionIds: chosen.map((option) => option.id),
      optionSummary: chosen.map((option) => option.name).join(", "),
      notes: notes.trim() || null,
      quantity,
    });
    onAdded();
    setCartOpen(true);
  }

  if (!product.available) {
    return (
      <Button type="button" size="lg" disabled className="w-full tracking-wide uppercase">
        No disponible
      </Button>
    );
  }

  return (
    <div className="space-y-5">
      {product.optionGroups.map((group) => {
        const selected = selection[group.id] ?? [];
        const radio = isRadio(group);
        const full = !radio && selected.length >= group.maxSelect;
        return (
          <fieldset key={group.id} className="space-y-2">
            <legend className="text-sm font-semibold">
              {group.name}
              <span className="text-muted-foreground font-normal">
                {group.required
                  ? " · obligatorio"
                  : group.maxSelect > 1
                    ? ` · hasta ${group.maxSelect}`
                    : " · opcional"}
              </span>
            </legend>
            <div className="grid gap-1">
              {group.options
                .filter((option) => option.available)
                .map((option) => {
                  const checked = selected.includes(option.id);
                  return (
                    <label
                      key={option.id}
                      className={cn(
                        "border-border flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm",
                        checked && "border-tomato-strong bg-cream-soft",
                        !checked && full && "cursor-not-allowed opacity-50",
                      )}
                    >
                      <input
                        type={radio ? "radio" : "checkbox"}
                        name={`group-${group.id}`}
                        checked={checked}
                        disabled={!checked && full}
                        onChange={() => toggle(group, option.id)}
                        className="accent-tomato-strong size-5 shrink-0"
                      />
                      <span>
                        {option.name}
                        <span className="text-muted-foreground">
                          {deltaLabel(option.priceDelta)}
                        </span>
                      </span>
                    </label>
                  );
                })}
            </div>
          </fieldset>
        );
      })}

      <div className="space-y-2">
        <label htmlFor={`notes-${product.id}`} className="text-sm font-semibold">
          Nota para este producto{" "}
          <span className="text-muted-foreground font-normal">(opcional)</span>
        </label>
        <input
          id={`notes-${product.id}`}
          type="text"
          maxLength={200}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Por ejemplo, sin albahaca"
          className="border-border bg-background h-11 w-full rounded-lg border px-3 text-sm"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <QuantityStepper value={quantity} onChange={setQuantity} label={product.name} />
        <p className="text-muted-foreground text-xs">Precio con IVA incluido</p>
      </div>

      <Button
        type="button"
        size="lg"
        disabled={!valid}
        onClick={addToCart}
        className="w-full tracking-wide uppercase"
      >
        <ShoppingBag aria-hidden />
        Añadir al pedido · {formatEuro(fromCents(unitCents * quantity))}
      </Button>
    </div>
  );
}
