"use client";

import { CreditCard } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

/** Datos de la tarjeta de prueba de Stripe: no es una tarjeta real y nunca cobra dinero. */
const TEST_CARD = [
  { label: "Número de tarjeta", value: "4242 4242 4242 4242" },
  { label: "Caducidad", value: "Cualquier fecha futura (por ejemplo, 12/34)" },
  { label: "CVC", value: "Cualquier número de 3 cifras (por ejemplo, 123)" },
  { label: "Nombre, correo y código postal", value: "Los que quieras" },
] as const;

interface DemoPaymentDialogProps {
  open: boolean;
  /** El cliente acepta y sigue a la página de pago. */
  onContinue: () => void;
  /** El cliente cierra el aviso sin pagar: el pedido queda pendiente de pago. */
  onCancel: () => void;
}

/**
 * Aviso previo al pago con tarjeta. La pasarela está en modo de prueba: se explica al cliente que el
 * pago es solo demostrativo y qué datos debe introducir.
 */
export function DemoPaymentDialog({ open, onContinue, onCancel }: DemoPaymentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onCancel())}>
      <DialogContent className="space-y-4 p-6">
        <div className="flex items-center gap-3">
          <span className="bg-gold/20 flex size-10 shrink-0 items-center justify-center rounded-full">
            <CreditCard aria-hidden className="size-5" />
          </span>
          <DialogTitle className="text-2xl leading-none font-bold">
            Pago de demostración
          </DialogTitle>
        </div>
        <DialogDescription className="text-sm">
          Este pago es <strong>únicamente demostrativo</strong>: no se cobrará ningún dinero y no
          debes usar tu tarjeta real. En la página siguiente introduce estos datos de prueba:
        </DialogDescription>
        <dl className="border-border divide-border divide-y rounded-xl border text-sm">
          {TEST_CARD.map((row) => (
            <div key={row.label} className="flex flex-col gap-0.5 px-4 py-2.5 sm:flex-row sm:gap-4">
              <dt className="text-muted-foreground sm:w-44 sm:shrink-0">{row.label}</dt>
              <dd className="font-semibold">{row.value}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onCancel}>
            Ahora no
          </Button>
          <Button type="button" onClick={onContinue}>
            Continuar al pago
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
