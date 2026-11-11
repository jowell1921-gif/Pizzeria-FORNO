"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useProfile } from "@/features/account/profile-context";
import { FormError } from "@/features/auth/form-parts";

import { orderErrorMessage, startPayment } from "./order";

/** Cada cuánto y cuántas veces se consulta el pedido tras volver de la página de pago. */
const POLL_MS = 3_000;
const POLL_MAX = 20;

interface PaymentSectionProps {
  orderId: string;
  /** Cómo volvió el cliente de la pasarela: «ok», «cancelado» o nada. */
  returned: "ok" | "cancelado" | null;
  onPoll: () => void;
}

/**
 * Pedido pendiente de pago online. Volver de la pasarela NO prueba el pago: se espera a que el servidor
 * lo confirme (webhook de Stripe) consultando el pedido unos segundos. Si no se pagó, se ofrece pagar
 * de nuevo.
 */
export function PaymentSection({ orderId, returned, onPoll }: PaymentSectionProps) {
  const { token } = useProfile();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [polls, setPolls] = useState(0);
  const waiting = returned === "ok" && polls < POLL_MAX;

  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => {
      setPolls((value) => value + 1);
      onPoll();
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [waiting, polls, onPoll]);

  async function pay() {
    if (!token) return;
    setPaying(true);
    setError(null);
    try {
      const session = await startPayment(token, orderId);
      window.location.assign(session.url);
    } catch (caught) {
      setError(orderErrorMessage(caught));
      setPaying(false);
    }
  }

  return (
    <section
      aria-label="Pago pendiente"
      className="border-tomato-strong space-y-3 rounded-2xl border-2 p-5"
    >
      <h2 className="text-2xl leading-none font-bold">Pago pendiente</h2>
      {waiting ? (
        <p role="status" className="flex items-center gap-2 text-sm font-medium">
          <Loader2 aria-hidden className="size-4 animate-spin" />
          Estamos confirmando tu pago con el banco. No cierres esta página…
        </p>
      ) : (
        <>
          <p className="text-sm">
            {returned === "cancelado"
              ? "Has salido de la página de pago sin completarla."
              : returned === "ok"
                ? "Todavía no hemos recibido la confirmación del pago. Si ya has pagado, aparecerá en unos minutos; si no, puedes intentarlo de nuevo."
                : "Tu pedido se confirmará cuando el pago se complete."}{" "}
            El pedido se cancela solo si no se paga en media hora.
          </p>
          <FormError>{error}</FormError>
          <Button type="button" size="lg" disabled={paying} onClick={() => void pay()}>
            {paying ? "Un momento…" : "Pagar ahora con tarjeta"}
          </Button>
        </>
      )}
    </section>
  );
}
