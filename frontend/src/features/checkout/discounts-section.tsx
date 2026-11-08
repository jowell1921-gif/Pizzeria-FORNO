"use client";

import { useState } from "react";

import { benefitText, type Redemption } from "@/features/account/loyalty";
import { Button } from "@/components/ui/button";
import { Field } from "@/features/auth/form-parts";
import { cn } from "@/lib/utils";

interface DiscountsSectionProps {
  /** Cupón aplicado (puede venir del código guardado en «Mi cuenta»). */
  coupon: string | null;
  onApplyCoupon: (code: string) => void;
  onRemoveCoupon: () => void;
  couponError: string | null;
  couponPending: boolean;
  /** Recompensas canjeadas y disponibles. */
  redemptions: Redemption[];
  redemptionId: string | null;
  onSelectRedemption: (id: string | null) => void;
  rewardError: string | null;
}

/** Cupón promocional y recompensa de FORNO CLUB. Los descuentos los valida y calcula el servidor. */
export function DiscountsSection({
  coupon,
  onApplyCoupon,
  onRemoveCoupon,
  couponError,
  couponPending,
  redemptions,
  redemptionId,
  onSelectRedemption,
  rewardError,
}: DiscountsSectionProps) {
  const [input, setInput] = useState("");

  function apply() {
    const code = input.trim().toUpperCase();
    if (code) {
      onApplyCoupon(code);
      setInput("");
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        {coupon ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              Código <code className="font-mono font-bold">{coupon}</code>
              {couponPending ? " · comprobando…" : couponError ? "" : " aplicado"}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={onRemoveCoupon}>
              Quitar código
            </Button>
          </div>
        ) : (
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              apply();
            }}
            className="space-y-3"
          >
            <Field
              id="checkout-coupon"
              label="¿Tienes un código promocional?"
              autoComplete="off"
              autoCapitalize="characters"
              maxLength={32}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              hint="Por ejemplo, BIENVENIDO10."
            />
            <Button type="submit" variant="outline" disabled={input.trim() === ""}>
              Aplicar código
            </Button>
          </form>
        )}
        {couponError ? (
          <p role="alert" className="text-destructive text-sm font-medium">
            {couponError}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold">Recompensas FORNO CLUB</p>
        {redemptions.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No tienes recompensas disponibles. Canjea tus puntos desde «Mi cuenta».
          </p>
        ) : (
          <div role="radiogroup" aria-label="Recompensa" className="grid gap-2">
            {[null, ...redemptions].map((item) => (
              <label
                key={item?.id ?? "none"}
                className={cn(
                  "border-border flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm",
                  redemptionId === (item?.id ?? null) && "border-tomato-strong bg-cream-soft",
                )}
              >
                <input
                  type="radio"
                  name="reward"
                  checked={redemptionId === (item?.id ?? null)}
                  onChange={() => onSelectRedemption(item?.id ?? null)}
                  className="accent-tomato-strong mt-0.5 size-5 shrink-0"
                />
                <span>
                  <span className="font-semibold">
                    {item ? item.rewardName : "No usar ninguna"}
                  </span>
                  {item ? (
                    <span className="text-muted-foreground block">{benefitText(item.benefit)}</span>
                  ) : null}
                </span>
              </label>
            ))}
          </div>
        )}
        {rewardError ? (
          <p role="alert" className="text-destructive text-sm font-medium">
            {rewardError}
          </p>
        ) : null}
      </div>
    </div>
  );
}
