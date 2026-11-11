"use client";

import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ORDER_STATUS_LABELS, ORDER_TYPE_LABELS } from "@/features/account/orders";
import { useProfile } from "@/features/account/profile-context";
import { useApiResource } from "@/features/account/use-api-resource";
import { ApiError } from "@/lib/api";
import { formatEuro } from "@/lib/format";

import { FormError } from "@/features/auth/form-parts";
import { DocumentsSection } from "./documents-section";
import { PaymentSection } from "./payment-section";
import { Button } from "@/components/ui/button";

import {
  cancelOrder,
  fetchOrder,
  orderErrorMessage,
  PAYMENT_LABELS,
  PAYMENT_STATUS_LABELS,
} from "./order";

const dateTime = new Intl.DateTimeFormat("es-ES", { dateStyle: "long", timeStyle: "short" });
const FINAL_STATUSES = new Set(["COMPLETED", "REJECTED", "CANCELLED"]);

/** Detalle y seguimiento de un pedido propio; se actualiza solo mientras está en curso. */
export function OrderView({ orderId }: { orderId: string }) {
  const { token } = useProfile();
  const [load] = useState(() => (accessToken: string) => fetchOrder(accessToken, orderId));
  const order = useApiResource(token, load);
  const { reload } = order;
  const finished = order.data ? FINAL_STATUSES.has(order.data.status) : false;
  // Cómo volvió el cliente de la pasarela de pago (solo informativo: el pago lo confirma el servidor).
  const [returned] = useState<"ok" | "cancelado" | null>(() => {
    if (typeof window === "undefined") return null;
    const value = new URLSearchParams(window.location.search).get("pago");
    return value === "ok" || value === "cancelado" ? value : null;
  });
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  async function cancel() {
    if (!token) return;
    setCancelling(true);
    setCancelError(null);
    try {
      await cancelOrder(token, orderId);
      setConfirmingCancel(false);
      reload();
    } catch (caught) {
      setCancelError(orderErrorMessage(caught));
      reload();
    } finally {
      setCancelling(false);
    }
  }

  // Consulta periódica mientras el pedido sigue en curso.
  useEffect(() => {
    if (!order.data || finished) return;
    const timer = setInterval(reload, 20_000);
    return () => clearInterval(timer);
  }, [order.data, finished, reload]);

  if (order.status === "error") {
    const notFound = order.error instanceof ApiError && order.error.status === 404;
    return (
      <div className="space-y-4">
        <p role="alert" className="text-destructive font-medium">
          {notFound ? "No encontramos este pedido." : "No hemos podido cargar tu pedido."}
        </p>
        <Link href="/cuenta" className={buttonVariants({ variant: "outline" })}>
          Volver a mi cuenta
        </Link>
      </div>
    );
  }
  if (order.status !== "ready" || !order.data) {
    return <p className="text-muted-foreground">Cargando tu pedido…</p>;
  }

  const data = order.data;
  const payment = data.payments[0];
  const awaitingPayment = data.status === "PENDING_PAYMENT" && payment?.method === "ONLINE";
  const settled = data.payments.some((item) =>
    ["PAID", "CASH_COLLECTED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(item.status),
  );

  return (
    <div className="space-y-6">
      <div className="bg-charcoal text-cream flex items-start gap-4 rounded-2xl p-6">
        <CheckCircle2 aria-hidden className="text-gold mt-1 size-8 shrink-0" />
        <div className="space-y-1">
          <p className="font-heading text-4xl leading-none font-extrabold uppercase">
            Pedido nº {data.orderNumber}
          </p>
          <p>
            <Badge className="bg-gold text-charcoal">{ORDER_STATUS_LABELS[data.status]}</Badge>{" "}
            <span className="text-cream/80 text-sm">
              {ORDER_TYPE_LABELS[data.type]}
              {data.scheduledFor
                ? ` · para el ${dateTime.format(new Date(data.scheduledFor))}`
                : data.estimatedReadyAt
                  ? ` · estimado: ${dateTime.format(new Date(data.estimatedReadyAt))}`
                  : ""}
            </span>
          </p>
        </div>
      </div>

      {awaitingPayment ? (
        <PaymentSection orderId={orderId} returned={returned} onPoll={reload} />
      ) : returned === "ok" && data.status === "NEW" ? (
        <p
          role="status"
          className="rounded-2xl bg-green-50 p-4 text-sm font-semibold text-green-900"
        >
          ¡Pago recibido! Tu pedido está confirmado.
        </p>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2">
        <section
          aria-labelledby="order-items"
          className="border-border bg-card space-y-3 rounded-2xl border p-5"
        >
          <h2 id="order-items" className="text-2xl leading-none font-bold">
            Productos
          </h2>
          <ul className="divide-border divide-y">
            {data.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-3 py-3 first:pt-0">
                <div>
                  <p className="font-semibold">
                    {item.quantity} × {item.productName}
                  </p>
                  {item.options.length > 0 ? (
                    <p className="text-muted-foreground text-sm">
                      {item.options.map((option) => option.name).join(", ")}
                    </p>
                  ) : null}
                </div>
                <p className="font-bold whitespace-nowrap">{formatEuro(item.lineTotal)}</p>
              </li>
            ))}
          </ul>
          <dl className="border-border space-y-1 border-t pt-3 text-sm">
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd>{formatEuro(data.totals.subtotal)}</dd>
            </div>
            {Number(data.totals.discount) > 0 ? (
              <div className="flex justify-between">
                <dt>Descuentos</dt>
                <dd>-{formatEuro(data.totals.discount)}</dd>
              </div>
            ) : null}
            {data.type === "DELIVERY" ? (
              <div className="flex justify-between">
                <dt>Gastos de envío</dt>
                <dd>{formatEuro(data.totals.deliveryFee)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between text-lg font-bold">
              <dt>Total</dt>
              <dd>{formatEuro(data.totals.total)}</dd>
            </div>
            <p className="text-muted-foreground text-xs">
              IVA incluido ({formatEuro(data.totals.tax)}).
            </p>
          </dl>
        </section>

        <section
          aria-labelledby="order-info"
          className="border-border bg-card space-y-4 rounded-2xl border p-5"
        >
          <h2 id="order-info" className="text-2xl leading-none font-bold">
            Detalles
          </h2>
          <dl className="space-y-3 text-sm">
            {payment ? (
              <div>
                <dt className="font-semibold">Pago</dt>
                <dd>
                  {PAYMENT_LABELS[payment.method]} ·{" "}
                  {PAYMENT_STATUS_LABELS[payment.status] ?? payment.status}
                </dd>
              </div>
            ) : null}
            {data.delivery ? (
              <div>
                <dt className="font-semibold">Dirección de entrega</dt>
                <dd>
                  {data.delivery.line1}
                  {data.delivery.line2 ? `, ${data.delivery.line2}` : ""}
                  <br />
                  {data.delivery.postalCode} {data.delivery.city}
                </dd>
              </div>
            ) : null}
            {data.notes ? (
              <div>
                <dt className="font-semibold">Observaciones</dt>
                <dd>{data.notes}</dd>
              </div>
            ) : null}
            <div>
              <dt className="font-semibold">Seguimiento</dt>
              <dd>
                <ol className="mt-1 space-y-1">
                  {data.history.map((entry) => (
                    <li key={`${entry.status}-${entry.at}`}>
                      {ORDER_STATUS_LABELS[entry.status]}{" "}
                      <span className="text-muted-foreground">
                        · {dateTime.format(new Date(entry.at))}
                      </span>
                    </li>
                  ))}
                </ol>
              </dd>
            </div>
          </dl>
        </section>
      </div>

      {settled ? <DocumentsSection orderId={orderId} /> : null}

      {data.status === "NEW" || data.status === "PENDING_PAYMENT" ? (
        <section
          aria-label="Cancelar el pedido"
          className="border-border space-y-3 rounded-2xl border p-5"
        >
          <p className="text-sm">
            Puedes cancelar el pedido mientras el local no lo haya aceptado. Se anula el pago
            pendiente, se libera el código y se te devuelven los puntos de la recompensa que hayas
            usado.
          </p>
          <FormError>{cancelError}</FormError>
          {confirmingCancel ? (
            <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold">¿Seguro que quieres cancelar el pedido?</span>
              <Button type="button" disabled={cancelling} onClick={() => void cancel()}>
                {cancelling ? "Cancelando…" : "Sí, cancelar"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={cancelling}
                onClick={() => setConfirmingCancel(false)}
              >
                No
              </Button>
            </div>
          ) : (
            <Button type="button" variant="outline" onClick={() => setConfirmingCancel(true)}>
              Cancelar pedido
            </Button>
          )}
        </section>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Link href="/cuenta" className={buttonVariants({ variant: "outline" })}>
          Ir a mi cuenta
        </Link>
        <Link href="/carta" className={buttonVariants()}>
          Hacer otro pedido
        </Link>
      </div>
    </div>
  );
}
