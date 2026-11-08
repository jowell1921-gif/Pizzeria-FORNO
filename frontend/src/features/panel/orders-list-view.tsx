"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ORDER_STATUS_LABELS, ORDER_TYPE_LABELS } from "@/features/account/orders";
import { useProfile } from "@/features/account/profile-context";
import { formatEuro } from "@/lib/format";
import { cn } from "@/lib/utils";

import { fetchAdminOrders, PAGE_SIZE, type OrderFilters } from "./panel-api";
import { useOrderStream } from "./use-order-stream";

const dateTime = new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short" });

const GROUPS = [
  {
    id: "active",
    label: "En curso",
    status: "NEW,ACCEPTED,PREPARING,READY,OUT_FOR_DELIVERY,PENDING_PAYMENT",
  },
  { id: "completed", label: "Completados", status: "COMPLETED" },
  { id: "cancelled", label: "Cancelados", status: "CANCELLED,REJECTED" },
  { id: "all", label: "Todos", status: "" },
] as const;

const fieldClass = "border-border bg-background h-11 w-full rounded-lg border px-3 text-sm";

/** Lista de pedidos con filtros (estado, modalidad, día, búsqueda) y paginación. */
export function OrdersListView() {
  const { token } = useProfile();
  const client = useQueryClient();
  const [group, setGroup] = useState<(typeof GROUPS)[number]["id"]>("active");
  const [type, setType] = useState("");
  const [date, setDate] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const filters: OrderFilters = {
    status: GROUPS.find((item) => item.id === group)?.status ?? "",
    type,
    date,
    q,
    page,
  };
  const query = useQuery({
    queryKey: ["admin", "orders", filters],
    queryFn: () => fetchAdminOrders(token ?? "", filters),
    enabled: token !== null,
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
  const live = useOrderStream("admin", token, () => {
    void client.invalidateQueries({ queryKey: ["admin"] });
  });

  const rows = query.data?.data ?? [];
  const meta = query.data?.meta;
  const reset = () => setPage(1);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-5xl leading-none font-extrabold uppercase">Pedidos</h1>
        <p aria-live="polite" className="text-muted-foreground flex items-center gap-2 text-sm">
          <span
            aria-hidden
            className={cn("size-2.5 rounded-full", live ? "bg-green-600" : "bg-amber-500")}
          />
          {live ? "En directo" : "Actualizando cada minuto"}
        </p>
      </div>

      <div role="tablist" aria-label="Estado" className="flex flex-wrap gap-2">
        {GROUPS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={group === item.id}
            onClick={() => {
              setGroup(item.id);
              reset();
            }}
            className={cn(
              "border-foreground/40 min-h-11 rounded-full border px-4 text-sm font-semibold",
              group === item.id && "bg-charcoal text-cream border-charcoal",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setQ(search.trim());
          reset();
        }}
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto]"
      >
        <div>
          <label htmlFor="orders-q" className="mb-1 block text-sm font-semibold">
            Buscar
          </label>
          <input
            id="orders-q"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nº de pedido, nombre o correo"
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="orders-type" className="mb-1 block text-sm font-semibold">
            Modalidad
          </label>
          <select
            id="orders-type"
            value={type}
            onChange={(event) => {
              setType(event.target.value);
              reset();
            }}
            className={fieldClass}
          >
            <option value="">Todas</option>
            <option value="PICKUP">Recogida</option>
            <option value="DELIVERY">A domicilio</option>
          </select>
        </div>
        <div>
          <label htmlFor="orders-date" className="mb-1 block text-sm font-semibold">
            Día
          </label>
          <input
            id="orders-date"
            type="date"
            value={date}
            onChange={(event) => {
              setDate(event.target.value);
              reset();
            }}
            className={fieldClass}
          />
        </div>
        <div className="flex items-end">
          <Button type="submit" className="h-11 w-full">
            Buscar
          </Button>
        </div>
      </form>

      {query.isError ? (
        <p role="alert" className="text-destructive font-medium">
          No hemos podido cargar los pedidos.
        </p>
      ) : !query.data ? (
        <p className="text-muted-foreground">Cargando pedidos…</p>
      ) : rows.length === 0 ? (
        <p className="border-border text-muted-foreground rounded-xl border border-dashed p-6 text-center">
          No hay pedidos con estos filtros.
        </p>
      ) : (
        <>
          <ul className="space-y-2" aria-label="Pedidos">
            {rows.map((order) => (
              <li key={order.id}>
                <Link
                  href={`/admin/pedidos/${order.id}`}
                  className="border-border bg-card hover:bg-cream-soft grid min-h-14 items-center gap-x-4 gap-y-1 rounded-xl border p-3 sm:grid-cols-[6rem_minmax(0,1fr)_auto_auto]"
                >
                  <span className="font-heading text-3xl leading-none font-extrabold">
                    #{order.orderNumber}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{order.customerName}</span>
                    <span className="text-muted-foreground block text-xs">
                      {ORDER_TYPE_LABELS[order.type]} · {order.itemCount}{" "}
                      {order.itemCount === 1 ? "producto" : "productos"} ·{" "}
                      {dateTime.format(new Date(order.placedAt))}
                      {order.scheduledFor
                        ? ` · para ${dateTime.format(new Date(order.scheduledFor))}`
                        : ""}
                    </span>
                  </span>
                  <Badge variant="secondary" className="w-fit">
                    {ORDER_STATUS_LABELS[order.status]}
                  </Badge>
                  <span className="font-bold sm:text-right">{formatEuro(order.total)}</span>
                </Link>
              </li>
            ))}
          </ul>

          {meta && meta.totalPages > 1 ? (
            <nav aria-label="Paginación" className="flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Anterior
              </Button>
              <p className="text-muted-foreground text-sm">
                Página {meta.page} de {meta.totalPages} · {meta.total} pedidos ({PAGE_SIZE} por
                página)
              </p>
              <Button
                type="button"
                variant="outline"
                disabled={page >= meta.totalPages}
                onClick={() => setPage(page + 1)}
              >
                Siguiente
              </Button>
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
