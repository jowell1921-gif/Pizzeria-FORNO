"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ORDER_STATUS_LABELS, ORDER_TYPE_LABELS } from "@/features/account/orders";
import { useProfile } from "@/features/account/profile-context";
import { formatEuro } from "@/lib/format";
import { cn } from "@/lib/utils";

import { fetchDashboard } from "./panel-api";
import { useOrderStream } from "./use-order-stream";

const time = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" });
const dayFormat = new Intl.DateTimeFormat("es-ES", { dateStyle: "full", timeZone: "UTC" });

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number | string;
  tone?: "default" | "alert";
}) {
  return (
    <div
      className={cn(
        "border-border bg-card rounded-2xl border p-4",
        tone === "alert" && "border-tomato-strong bg-cream-soft",
      )}
    >
      <dt className="text-muted-foreground text-sm font-semibold">{label}</dt>
      <dd className="font-heading mt-1 text-5xl leading-none font-extrabold">{value}</dd>
    </div>
  );
}

/** Resumen del día: pedidos por estado, ventas, productos más pedidos y últimos pedidos. */
export function DashboardView() {
  const { token } = useProfile();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["admin", "dashboard"],
    queryFn: () => fetchDashboard(token ?? ""),
    enabled: token !== null,
    refetchInterval: 60_000,
  });
  const live = useOrderStream("admin", token, () => {
    void client.invalidateQueries({ queryKey: ["admin"] });
  });

  if (query.isError) {
    return (
      <p role="alert" className="text-destructive font-medium">
        No hemos podido cargar el panel. Comprueba que la API está en marcha.
      </p>
    );
  }
  if (!query.data) return <p className="text-muted-foreground">Cargando el resumen…</p>;
  const { orders, sales, popularProducts, recentOrders } = query.data;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-5xl leading-none font-extrabold uppercase">Panel de control</h1>
          <p className="text-muted-foreground mt-1 first-letter:uppercase">
            {dayFormat.format(new Date(`${query.data.date}T00:00:00Z`))}
          </p>
        </div>
        <p aria-live="polite" className="text-muted-foreground flex items-center gap-2 text-sm">
          <span
            aria-hidden
            className={cn("size-2.5 rounded-full", live ? "bg-green-600" : "bg-amber-500")}
          />
          {live ? "En directo" : "Actualizando cada minuto"}
        </p>
      </div>

      <dl
        aria-label="Pedidos de hoy"
        className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"
      >
        <Stat label="Pedidos de hoy" value={orders.total} />
        <Stat
          label="Pendientes"
          value={orders.pending}
          tone={orders.pending > 0 ? "alert" : "default"}
        />
        <Stat label="En preparación" value={orders.preparing} />
        <Stat label="Listos" value={orders.ready} />
        <Stat label="Completados" value={orders.completed} />
        <Stat label="Cancelados" value={orders.cancelled} />
      </dl>

      <dl aria-label="Ventas de hoy" className="grid gap-3 sm:grid-cols-3">
        <Stat label="Ventas (completados)" value={formatEuro(sales.completed)} />
        <Stat label="En curso" value={formatEuro(sales.inProgress)} />
        <Stat label="Ticket medio" value={formatEuro(sales.averageTicket)} />
      </dl>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section
          aria-labelledby="recent-title"
          className="border-border bg-card space-y-3 rounded-2xl border p-5"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 id="recent-title" className="text-2xl leading-none font-bold">
              Últimos pedidos
            </h2>
            <Link
              href="/admin/pedidos"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Ver todos
            </Link>
          </div>
          {recentOrders.length === 0 ? (
            <p className="text-muted-foreground text-sm">Todavía no hay pedidos.</p>
          ) : (
            <ul className="divide-border divide-y">
              {recentOrders.map((order) => (
                <li key={order.id}>
                  <Link
                    href={`/admin/pedidos/${order.id}`}
                    className="hover:bg-cream-soft flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg px-2 py-2"
                  >
                    <span>
                      <span className="font-semibold">Pedido nº {order.orderNumber}</span>
                      <span className="text-muted-foreground block text-xs">
                        {order.customerName} · {ORDER_TYPE_LABELS[order.type]} ·{" "}
                        {time.format(new Date(order.placedAt))}
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <Badge variant="secondary">{ORDER_STATUS_LABELS[order.status]}</Badge>
                      <span className="font-bold">{formatEuro(order.total)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          aria-labelledby="popular-title"
          className="border-border bg-card space-y-3 rounded-2xl border p-5"
        >
          <h2 id="popular-title" className="text-2xl leading-none font-bold">
            Más pedidos (7 días)
          </h2>
          {popularProducts.length === 0 ? (
            <p className="text-muted-foreground text-sm">Sin datos todavía.</p>
          ) : (
            <ol className="space-y-2">
              {popularProducts.map((product, index) => (
                <li key={product.name} className="flex items-center justify-between gap-3 text-sm">
                  <span>
                    <span className="text-muted-foreground mr-2 font-bold">{index + 1}.</span>
                    {product.name}
                  </span>
                  <span className="font-bold">{product.quantity} uds.</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
