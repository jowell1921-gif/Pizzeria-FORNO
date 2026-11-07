"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Field, FormError } from "@/features/auth/form-parts";

import {
  addressFormSchema,
  createAddress,
  updateAddress,
  type Address,
  type AddressFormValues,
} from "./addresses";

interface AddressFormProps {
  token: string;
  /** Dirección a editar; si no hay, se crea una nueva. */
  address?: Address;
  /** Valores iniciales de una dirección nueva (nombre y teléfono del cliente). */
  defaults: { recipientName: string; phone: string };
  isFirst: boolean;
  onSaved: () => void;
  onCancel: () => void;
}

export function AddressForm({
  token,
  address,
  defaults,
  isFirst,
  onSaved,
  onCancel,
}: AddressFormProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AddressFormValues>({
    resolver: zodResolver(addressFormSchema),
    defaultValues: {
      label: address?.label ?? "",
      recipientName: address?.recipientName ?? defaults.recipientName,
      phone: address?.phone ?? defaults.phone,
      line1: address?.line1 ?? "",
      line2: address?.line2 ?? "",
      postalCode: address?.postalCode ?? "",
      city: address?.city ?? "",
      notes: address?.notes ?? "",
      isDefault: address?.isDefault ?? isFirst,
    },
  });

  async function onSubmit(values: AddressFormValues) {
    setServerError(null);
    try {
      if (address) await updateAddress(token, address.id, values);
      else await createAddress(token, values);
      onSaved();
    } catch {
      setServerError(
        "No hemos podido guardar la dirección. Revisa los datos e inténtalo de nuevo.",
      );
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <Field
        id="address-label"
        label="Nombre de la dirección (opcional)"
        hint="Por ejemplo: Casa o Trabajo."
        error={errors.label?.message}
        {...register("label")}
      />
      <Field
        id="address-recipient"
        label="Nombre de quien recibe"
        autoComplete="name"
        error={errors.recipientName?.message}
        {...register("recipientName")}
      />
      <Field
        id="address-line1"
        label="Calle y número"
        autoComplete="address-line1"
        error={errors.line1?.message}
        {...register("line1")}
      />
      <Field
        id="address-line2"
        label="Piso, puerta, escalera… (opcional)"
        autoComplete="address-line2"
        error={errors.line2?.message}
        {...register("line2")}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="address-postal"
          label="Código postal"
          inputMode="numeric"
          autoComplete="postal-code"
          error={errors.postalCode?.message}
          {...register("postalCode")}
        />
        <Field
          id="address-city"
          label="Ciudad"
          autoComplete="address-level2"
          error={errors.city?.message}
          {...register("city")}
        />
      </div>
      <Field
        id="address-phone"
        label="Teléfono de contacto (opcional)"
        type="tel"
        autoComplete="tel"
        error={errors.phone?.message}
        {...register("phone")}
      />
      <Field
        id="address-notes"
        label="Indicaciones para el repartidor (opcional)"
        error={errors.notes?.message}
        {...register("notes")}
      />
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="accent-tomato-strong mt-0.5 size-5 shrink-0"
          {...register("isDefault")}
        />
        <span>Usar como dirección predeterminada</span>
      </label>

      <FormError>{serverError}</FormError>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Guardando…" : address ? "Guardar dirección" : "Añadir dirección"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
