"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { AddressForm } from "@/features/account/address-form";
import type { Address } from "@/features/account/addresses";
import { useProfile } from "@/features/account/profile-context";
import type { Quote } from "@/features/cart/quote";
import { formatEuro } from "@/lib/format";
import { cn } from "@/lib/utils";

interface DeliverySectionProps {
  addresses: Address[];
  reload: () => void;
  /** Dirección elegida (la predeterminada si el cliente no ha elegido otra). */
  effectiveId: string | null;
  onSelect: (id: string) => void;
  /** ¿Se reparte en este código postal? (según las zonas del local) */
  hasDelivery: (postalCode: string) => boolean;
  quote: Quote | undefined;
}

/** Elección de la dirección de entrega y aviso de si se reparte en su código postal. */
export function DeliverySection({
  addresses: list,
  reload,
  effectiveId,
  onSelect,
  hasDelivery,
  quote,
}: DeliverySectionProps) {
  const { token, profile } = useProfile();
  const [adding, setAdding] = useState(false);

  if (!token || !profile) return null;
  const delivery = quote?.delivery;

  return (
    <div className="space-y-4">
      {list.length > 0 && !adding ? (
        <div role="radiogroup" aria-label="Dirección de entrega" className="grid gap-2">
          {list.map((address) => (
            <label
              key={address.id}
              className={cn(
                "border-border flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm",
                effectiveId === address.id && "border-tomato-strong bg-cream-soft",
              )}
            >
              <input
                type="radio"
                name="address"
                checked={effectiveId === address.id}
                onChange={() => onSelect(address.id)}
                className="accent-tomato-strong mt-0.5 size-5 shrink-0"
              />
              <span>
                <span className="font-semibold">{address.label || address.recipientName}</span>
                {hasDelivery(address.postalCode) ? null : (
                  <span className="text-destructive ml-2 text-xs font-semibold">
                    Sin reparto en esta zona
                  </span>
                )}
                <span className="text-muted-foreground block">
                  {address.line1}
                  {address.line2 ? `, ${address.line2}` : ""} · {address.postalCode} {address.city}
                </span>
              </span>
            </label>
          ))}
          <Button type="button" variant="outline" onClick={() => setAdding(true)}>
            <Plus aria-hidden />
            Usar otra dirección
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {list.length === 0 ? (
            <p className="text-sm">Añade la dirección donde quieres recibir el pedido.</p>
          ) : null}
          <AddressForm
            token={token}
            defaults={{ recipientName: profile.fullName, phone: profile.phone ?? "" }}
            isFirst={list.length === 0}
            onSaved={() => {
              setAdding(false);
              reload();
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}

      {delivery ? (
        delivery.covered ? (
          <p role="status" className="text-sm">
            Repartimos en tu zona
            {delivery.zoneName ? ` (${delivery.zoneName})` : ""}.
            {delivery.minimumOrder ? ` Pedido mínimo: ${formatEuro(delivery.minimumOrder)}.` : ""}
          </p>
        ) : (
          <p role="alert" className="text-destructive text-sm font-medium">
            No repartimos en el código postal de esta dirección. Elige otra dirección o recoge el
            pedido en el local.
          </p>
        )
      ) : null}
      {delivery?.covered && delivery.belowMinimum ? (
        <p role="alert" className="text-destructive text-sm font-medium">
          Tu pedido no alcanza el mínimo de {formatEuro(delivery.minimumOrder ?? "0.00")} para esta
          zona. Añade más productos.
        </p>
      ) : null}
    </div>
  );
}
