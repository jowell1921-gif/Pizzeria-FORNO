"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ORDER_TYPE_LABELS } from "@/features/account/orders";
import { useProfile } from "@/features/account/profile-context";
import { FormError } from "@/features/auth/form-parts";
import { cn } from "@/lib/utils";

import {
  changeKitchenOrderStatus,
  errorMessage,
  fetchKitchenOrders,
  type KitchenOrder,
  type OrderStatus,
} from "./panel-api";
import { useOrderStream } from "./use-order-stream";

const hour = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" });

interface Column {
  status: OrderStatus;
  title: string;
  /** Estados que se muestran en esta columna. */
  includes: OrderStatus[];
}

const COLUMNS: Column[] = [
  { status: "NEW", title: "Nuevos", includes: ["NEW"] },
  { status: "ACCEPTED", title: "Aceptados", includes: ["ACCEPTED"] },
  { status: "PREPARING", title: "En preparación", includes: ["PREPARING"] },
  { status: "READY", title: "Listos", includes: ["READY"] },
  { status: "COMPLETED", title: "Completados", includes: ["COMPLETED"] },
];

/** Siguiente paso que puede dar la cocina y el texto del botón. */
export function nextKitchenStep(order: Pick<KitchenOrder, "status" | "type">) {
  switch (order.status) {
    case "NEW":
      return { to: "ACCEPTED" as const, label: "Aceptar" };
    case "ACCEPTED":
      return { to: "PREPARING" as const, label: "Empezar" };
    case "PREPARING":
      return { to: "READY" as const, label: "Listo" };
    case "READY":
      // Recogida: se entrega al cliente. Domicilio: se entrega al repartidor y el personal lo cierra.
      return order.type === "PICKUP"
        ? { to: "COMPLETED" as const, label: "Entregado" }
        : { to: "OUT_FOR_DELIVERY" as const, label: "Entregado al repartidor" };
    default:
      return null;
  }
}

function minutesSince(iso: string, now: number) {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
}

function OrderCard({
  order,
  now,
  busy,
  onAdvance,
}: {
  order: KitchenOrder;
  now: number;
  busy: boolean;
  onAdvance: (order: KitchenOrder, to: OrderStatus) => void;
}) {
  const step = nextKitchenStep(order);
  const waiting = minutesSince(order.placedAt, now);
  const late = order.status !== "COMPLETED" && waiting >= 25;

  return (
    <article
      aria-label={`Pedido ${order.orderNumber}`}
      className={cn(
        "border-border bg-card space-y-3 rounded-2xl border-2 p-4 shadow-sm",
        late && "border-tomato-strong",
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-heading text-5xl leading-none font-extrabold">#{order.orderNumber}</h3>
        <div className="text-right text-sm">
          <p className="font-bold">{ORDER_TYPE_LABELS[order.type]}</p>
          <p className="text-muted-foreground">Entrada {hour.format(new Date(order.placedAt))}</p>
          {order.scheduledFor ? (
            <p className="font-semibold">Para las {hour.format(new Date(order.scheduledFor))}</p>
          ) : order.estimatedReadyAt ? (
            <p className="font-semibold">
              Estimado {hour.format(new Date(order.estimatedReadyAt))}
            </p>
          ) : null}
          {order.status !== "COMPLETED" ? (
            <p
              className={cn(
                "text-xs",
                late ? "text-tomato-deep font-bold" : "text-muted-foreground",
              )}
            >
              Hace {waiting} min
            </p>
          ) : null}
        </div>
      </header>

      <ul className="space-y-2">
        {order.items.map((item, index) => (
          <li key={index} className="text-lg leading-snug">
            <span className="font-extrabold">{item.quantity} ×</span>{" "}
            <span className="font-semibold">{item.name}</span>
            {item.options.length > 0 ? (
              <span className="text-muted-foreground block text-base">
                {item.options.join(" · ")}
              </span>
            ) : null}
            {item.notes ? (
              <span className="block text-base font-semibold">«{item.notes}»</span>
            ) : null}
          </li>
        ))}
      </ul>

      {order.notes ? (
        <p className="bg-gold/25 rounded-lg p-2 text-base font-semibold">⚠ {order.notes}</p>
      ) : null}

      {step ? (
        <Button
          type="button"
          size="lg"
          disabled={busy}
          onClick={() => onAdvance(order, step.to)}
          className="h-auto min-h-14 w-full px-3 py-2 text-center text-lg leading-tight tracking-wide whitespace-normal uppercase"
        >
          {busy ? "…" : step.label}
        </Button>
      ) : null}
    </article>
  );
}

/** Pantalla de cocina: columnas por estado, acciones rápidas y actualización en directo (SSE). */
export function KitchenBoard() {
  const { token } = useProfile();
  const client = useQueryClient();
  const queryKey = ["kitchen", "orders"];
  const query = useQuery({
    queryKey,
    queryFn: () => fetchKitchenOrders(token ?? ""),
    enabled: token !== null,
    // Respaldo si el flujo en directo se corta: consulta cada 20 s.
    refetchInterval: 20_000,
  });
  const live = useOrderStream("kitchen", token, () => {
    void client.invalidateQueries({ queryKey });
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Reloj para los «hace X min».
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  async function advance(order: KitchenOrder, to: OrderStatus) {
    if (!token) return;
    setBusyId(order.id);
    setError(null);
    try {
      await changeKitchenOrderStatus(token, order.id, to);
    } catch (caught) {
      setError(`Pedido ${order.orderNumber}: ${errorMessage(caught)}`);
    } finally {
      setBusyId(null);
      void client.invalidateQueries({ queryKey });
    }
  }

  const orders = query.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-5xl leading-none font-extrabold uppercase">Cocina</h1>
        <p aria-live="polite" className="text-muted-foreground flex items-center gap-2 text-sm">
          <span
            aria-hidden
            className={cn("size-2.5 rounded-full", live ? "bg-green-600" : "bg-amber-500")}
          />
          {live ? "En directo" : "Reconectando… (se actualiza cada 20 s)"}
        </p>
      </div>
      <FormError>{error}</FormError>

      {query.isError ? (
        <p role="alert" className="text-destructive font-medium">
          No hemos podido cargar los pedidos. Se reintentará solo.
        </p>
      ) : !query.data ? (
        <p className="text-muted-foreground">Cargando pedidos…</p>
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-5">
          {COLUMNS.map((column) => {
            const items = orders.filter((order) => column.includes.includes(order.status));
            return (
              <section
                key={column.status}
                aria-label={column.title}
                className="bg-cream-soft min-w-0 space-y-3 rounded-2xl p-3"
              >
                <h2 className="flex items-center justify-between gap-2 text-2xl leading-none font-bold">
                  {column.title}
                  <span className="bg-charcoal text-cream rounded-full px-2.5 py-0.5 text-sm">
                    {items.length}
                  </span>
                </h2>
                {items.length === 0 ? (
                  <p className="text-muted-foreground py-4 text-center text-sm">Sin pedidos</p>
                ) : (
                  items.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      now={now}
                      busy={busyId === order.id}
                      onAdvance={(target, to) => void advance(target, to)}
                    />
                  ))
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
