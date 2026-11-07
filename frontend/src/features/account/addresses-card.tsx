"use client";

import { MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormError } from "@/features/auth/form-parts";

import { AddressForm } from "./address-form";
import { deleteAddress, fetchAddresses, updateAddress, type Address } from "./addresses";
import { CardMessage, CardSection } from "./card-section";
import { useProfile } from "./profile-context";
import { useApiResource } from "./use-api-resource";

type Mode = { kind: "list" } | { kind: "new" } | { kind: "edit"; address: Address };

/** Direcciones de entrega guardadas del cliente. */
export function AddressesCard() {
  const { token, profile } = useProfile();
  const addresses = useApiResource(token, fetchAddresses);
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!token || !profile) return null;

  async function run(action: () => Promise<unknown>) {
    setActionError(null);
    try {
      await action();
      addresses.reload();
    } catch {
      setActionError("No hemos podido completar la acción. Inténtalo de nuevo.");
    }
  }

  const list = addresses.data ?? [];
  const showForm = mode.kind !== "list";

  return (
    <CardSection
      id="addresses-title"
      title="Mis direcciones"
      icon={MapPin}
      action={
        !showForm && addresses.status === "ready" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setMode({ kind: "new" })}
          >
            <Plus aria-hidden />
            Añadir
          </Button>
        ) : null
      }
    >
      <FormError>{actionError}</FormError>

      {showForm ? (
        <AddressForm
          token={token}
          address={mode.kind === "edit" ? mode.address : undefined}
          defaults={{ recipientName: profile.fullName, phone: profile.phone ?? "" }}
          isFirst={list.length === 0}
          onSaved={() => {
            setMode({ kind: "list" });
            addresses.reload();
          }}
          onCancel={() => setMode({ kind: "list" })}
        />
      ) : addresses.status === "error" ? (
        <div className="space-y-3">
          <CardMessage>No hemos podido cargar tus direcciones.</CardMessage>
          <Button type="button" variant="outline" onClick={addresses.reload}>
            Reintentar
          </Button>
        </div>
      ) : addresses.status !== "ready" ? (
        <CardMessage>Cargando tus direcciones…</CardMessage>
      ) : list.length === 0 ? (
        <CardMessage>
          Aún no has guardado ninguna dirección. Añade una para pedir a domicilio más rápido.
        </CardMessage>
      ) : (
        <ul className="divide-border divide-y">
          {list.map((address) => (
            <li key={address.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{address.label || address.recipientName}</p>
                {address.isDefault ? <Badge variant="secondary">Predeterminada</Badge> : null}
              </div>
              <p className="text-muted-foreground text-sm">
                {address.line1}
                {address.line2 ? `, ${address.line2}` : ""}
                <br />
                {address.postalCode} {address.city}
              </p>

              {confirmingId === address.id ? (
                <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold">¿Eliminar esta dirección?</span>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      setConfirmingId(null);
                      void run(() => deleteAddress(token, address.id));
                    }}
                  >
                    Sí, eliminar
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmingId(null)}
                  >
                    No
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`Editar la dirección ${address.label || address.line1}`}
                    onClick={() => setMode({ kind: "edit", address })}
                  >
                    <Pencil aria-hidden />
                    Editar
                  </Button>
                  {!address.isDefault ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        void run(() => updateAddress(token, address.id, { isDefault: true }))
                      }
                    >
                      Predeterminada
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`Eliminar la dirección ${address.label || address.line1}`}
                    onClick={() => setConfirmingId(address.id)}
                  >
                    <Trash2 aria-hidden />
                    Eliminar
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </CardSection>
  );
}
