"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ORDER_STATUS_LABELS, ORDER_TYPE_LABELS } from "@/features/account/orders";
import { useProfile } from "@/features/account/profile-context";
import { FormError } from "@/features/auth/form-parts";
import { PAYMENT_LABELS, PAYMENT_STATUS_LABELS } from "@/features/checkout/order";
import { ApiError } from "@/lib/api";
import { formatEuro } from "@/lib/format";
import { cn } from "@/lib/utils";

import {
  changeAdminOrderStatus,
  errorMessage,
  fetchAdminOrder,
  needsReason,
  STATUS_ACTION_LABELS,
  type OrderStatus,
} from "./panel-api";
import { useOrderStream } from "./use-order-stream";

const dateTime = new Intl.DateTimeFormat("es-ES", { dateStyle: "long", timeStyle: "short" });

/** Detalle de un pedido para el personal, con los botones de los cambios de estado válidos. */
export function OrderDetailView({ orderId }: { orderId: string }) {
  const { token } = useProfile();
  const client = useQueryClient();
  const queryKey = ["admin", "order", orderId];
  const query = useQuery({
    queryKey,
    queryFn: () => fetchAdminOrder(token ?? "", orderId),
    enabled: token !== null,
  });
  useOrderStream("admin", token, (event) => {
    if (event.orderId === orderId) void client.invalidateQueries({ queryKey });
  });

  const [pending, setPending] = useState<OrderStatus | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (query.isError) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <div className="space-y-4">
        <p role="alert" className="text-destructive font-medium">
          {notFound ? "No existe este pedido." : "No hemos podido cargar el pedido."}
        </p>
        <Link href="/admin/pedidos" className={buttonVariants({ variant: "outline" })}>
          Volver a los pedidos
        </Link>
      </div>
    );
  }
  if (!query.data) return <p className="text-muted-foreground">Cargando el pedido…</p>;
  const order = query.data;

  async function apply(status: OrderStatus) {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await changeAdminOrderStatus(token, orderId, {
        status,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      client.setQueryData(queryKey, updated);
      void client.invalidateQueries({ queryKey: ["admin"] });
      setPending(null);
      setReason("");
    } catch (caught) {
      setError(errorMessage(caught));
      void client.invalidateQueries({ queryKey });
    } finally {
      setBusy(false);
    }
  }

  function choose(status: OrderStatus) {
    setError(null);
    // Rechazar y cancelar piden confirmación; rechazar y devolver, además, el motivo.
    if (status === "REJECTED" || status === "CANCELLED" || needsReason(order.status, status)) {
      setPending(status);
    } else {
      void apply(status);
    }
  }

  const destructive = (status: OrderStatus) => status === "REJECTED" || status === "CANCELLED";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/pedidos" className="text-sm font-semibold underline underline-offset-4">
          ← Pedidos
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-5xl leading-none font-extrabold uppercase">
            Pedido nº {order.orderNumber}
          </h1>
          <Badge className="bg-charcoal text-cream text-sm">
            {ORDER_STATUS_LABELS[order.status]}
          </Badge>
          <Badge variant="secondary" className="text-sm">
            {ORDER_TYPE_LABELS[order.type]}
          </Badge>
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          Recibido el {dateTime.format(new Date(order.placedAt))}
          {order.scheduledFor
            ? ` · hora solicitada: ${dateTime.format(new Date(order.scheduledFor))}`
            : order.estimatedReadyAt
              ? ` · tiempo estimado: ${dateTime.format(new Date(order.estimatedReadyAt))}`
              : ""}
        </p>
      </div>

      <section
        aria-labelledby="actions-title"
        className="border-border bg-card space-y-4 rounded-2xl border p-5"
      >
        <h2 id="actions-title" className="text-2xl leading-none font-bold">
          Acciones
        </h2>
        {order.allowedNext.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Este pedido está cerrado: no admite más cambios.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {order.allowedNext.map((status) => (
              <Button
                key={status}
                type="button"
                size="lg"
                variant={destructive(status) ? "outline" : "default"}
                disabled={busy}
                onClick={() => choose(status)}
                className={cn(destructive(status) && "border-destructive text-destructive")}
              >
                {order.status === "COMPLETED" && status === "CANCELLED"
                  ? "Devolver / cancelar"
                  : STATUS_ACTION_LABELS[status]}
              </Button>
            ))}
          </div>
        )}

        {pending ? (
          <div role="alert" className="border-border bg-cream-soft space-y-3 rounded-xl border p-4">
            <p className="font-semibold">
              {pending === "REJECTED"
                ? "¿Rechazar este pedido?"
                : order.status === "COMPLETED"
                  ? "¿Devolver este pedido? Se retirarán los puntos concedidos."
                  : "¿Cancelar este pedido?"}
            </p>
            <label htmlFor="status-reason" className="block text-sm font-semibold">
              Motivo{needsReason(order.status, pending) ? "" : " (opcional)"}
            </label>
            <input
              id="status-reason"
              type="text"
              maxLength={300}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="border-border bg-background h-11 w-full rounded-lg border px-3 text-sm"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={busy || (needsReason(order.status, pending) && reason.trim().length < 3)}
                onClick={() => void apply(pending)}
              >
                {busy ? "Guardando…" : "Confirmar"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setPending(null);
                  setReason("");
                }}
              >
                No
              </Button>
            </div>
          </div>
        ) : null}
        <FormError>{error}</FormError>
        {order.cancellationReason ? (
          <p className="text-sm">
            <span className="font-semibold">Motivo: </span>
            {order.cancellationReason}
          </p>
        ) : null}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section
          aria-labelledby="items-title"
          className="border-border bg-card space-y-3 rounded-2xl border p-5"
        >
          <h2 id="items-title" className="text-2xl leading-none font-bold">
            Productos
          </h2>
          <ul className="divide-border divide-y">
            {order.items.map((item) => (
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
                  {item.notes ? <p className="text-sm font-medium">«{item.notes}»</p> : null}
                </div>
                <p className="font-bold whitespace-nowrap">{formatEuro(item.lineTotal)}</p>
              </li>
            ))}
          </ul>
          <dl className="border-border space-y-1 border-t pt-3 text-sm">
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd>{formatEuro(order.totals.subtotal)}</dd>
            </div>
            {order.discounts.map((discount) => (
              <div key={discount.description} className="flex justify-between">
                <dt>{discount.description}</dt>
                <dd>-{formatEuro(discount.amount)}</dd>
              </div>
            ))}
            {order.type === "DELIVERY" ? (
              <div className="flex justify-between">
                <dt>Gastos de envío</dt>
                <dd>{formatEuro(order.totals.deliveryFee)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between text-lg font-bold">
              <dt>Total</dt>
              <dd>{formatEuro(order.totals.total)}</dd>
            </div>
            <div className="text-muted-foreground flex justify-between text-xs">
              <dt>IVA incluido</dt>
              <dd>{formatEuro(order.totals.tax)}</dd>
            </div>
          </dl>
        </section>

        <div className="space-y-6">
          <section
            aria-labelledby="customer-title"
            className="border-border bg-card space-y-3 rounded-2xl border p-5"
          >
            <h2 id="customer-title" className="text-2xl leading-none font-bold">
              Cliente
            </h2>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="font-semibold">Nombre</dt>
                <dd>{order.customer.name}</dd>
              </div>
              <div>
                <dt className="font-semibold">Teléfono</dt>
                <dd>
                  {order.customer.phone ? (
                    <a
                      href={`tel:${order.customer.phone.replace(/\s/g, "")}`}
                      className="underline underline-offset-4"
                    >
                      {order.customer.phone}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Correo</dt>
                <dd className="break-all">{order.customer.email}</dd>
              </div>
              {order.delivery ? (
                <div>
                  <dt className="font-semibold">Dirección de entrega</dt>
                  <dd>
                    {order.delivery.name ? `${order.delivery.name} · ` : ""}
                    {order.delivery.line1}
                    {order.delivery.line2 ? `, ${order.delivery.line2}` : ""}
                    <br />
                    {order.delivery.postalCode} {order.delivery.city}
                    {order.delivery.zone ? ` (${order.delivery.zone})` : ""}
                    {order.delivery.notes ? (
                      <>
                        <br />
                        <span className="text-muted-foreground">{order.delivery.notes}</span>
                      </>
                    ) : null}
                  </dd>
                </div>
              ) : null}
              {order.notes ? (
                <div>
                  <dt className="font-semibold">Observaciones</dt>
                  <dd className="bg-cream-soft rounded-lg p-2">{order.notes}</dd>
                </div>
              ) : null}
              {order.couponCode ? (
                <div>
                  <dt className="font-semibold">Código usado</dt>
                  <dd className="font-mono">{order.couponCode}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          {order.payments ? (
            <section
              aria-labelledby="payment-title"
              className="border-border bg-card space-y-2 rounded-2xl border p-5"
            >
              <h2 id="payment-title" className="text-2xl leading-none font-bold">
                Pago
              </h2>
              {order.payments.map((payment, index) => (
                <p key={index} className="text-sm">
                  {PAYMENT_LABELS[payment.method]} ·{" "}
                  {PAYMENT_STATUS_LABELS[payment.status] ?? payment.status} ·{" "}
                  <span className="font-bold">{formatEuro(payment.amount)}</span>
                </p>
              ))}
            </section>
          ) : null}

          <section
            aria-labelledby="history-title"
            className="border-border bg-card space-y-3 rounded-2xl border p-5"
          >
            <h2 id="history-title" className="text-2xl leading-none font-bold">
              Historial
            </h2>
            <ol className="space-y-2 text-sm">
              {order.history.map((entry, index) => (
                <li key={index}>
                  <span className="font-semibold">{ORDER_STATUS_LABELS[entry.status]}</span>
                  <span className="text-muted-foreground block text-xs">
                    {dateTime.format(new Date(entry.at))}
                    {entry.by ? ` · ${entry.by}` : ""}
                    {entry.reason ? ` · ${entry.reason}` : ""}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
