"use client";

import { Ticket } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Field, FormSuccess } from "@/features/auth/form-parts";

import { CardSection } from "./card-section";
import {
  clearPromoCode,
  normalizePromoCode,
  PROMO_CODE_PATTERN,
  savePromoCode,
  useSavedPromoCode,
} from "./promo-code-store";

/**
 * Código promocional. Aquí solo se guarda el código en este navegador: la comprobación de si es
 * válido y el descuento los calcula el servidor cuando se realiza el pedido.
 */
export function PromoCodeCard() {
  const saved = useSavedPromoCode();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const code = normalizePromoCode(value);
    if (!PROMO_CODE_PATTERN.test(code)) {
      setError("Introduce un código válido (letras, números y guiones, de 3 a 24 caracteres).");
      return;
    }
    setError(null);
    savePromoCode(code);
    setValue("");
  }

  return (
    <CardSection id="promo-title" title="Código promocional" icon={Ticket}>
      {saved ? (
        <div className="space-y-3">
          <FormSuccess>
            Código <code className="font-mono font-bold">{saved}</code> guardado. Se comprobará al
            hacer tu pedido.
          </FormSuccess>
          <Button type="button" variant="outline" onClick={clearPromoCode}>
            Quitar código
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-3">
          <Field
            id="promo-code"
            label="¿Tienes un código?"
            hint="Por ejemplo, BIENVENIDO10. Lo validamos al hacer el pedido."
            autoComplete="off"
            autoCapitalize="characters"
            maxLength={24}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            error={error ?? undefined}
          />
          <Button type="submit">Guardar código</Button>
        </form>
      )}
    </CardSection>
  );
}
