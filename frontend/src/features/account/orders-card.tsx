"use client";

import { ShoppingBag } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatEuro } from "@/lib/format";

import { CardMessage, CardSection } from "./card-section";
import { fetchRecentOrders, ORDER_STATUS_LABELS, ORDER_TYPE_LABELS } from "./orders";
import { useProfile } from "./profile-context";
import { useApiResource } from "./use-api-resource";

const dateFormat = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** Últimos pedidos del cliente. */
export function OrdersCard() {
  const { token } = useProfile();
  const orders = useApiResource(token, fetchRecentOrders);

  return (
    <CardSection id="orders-title" title="Mis pedidos" icon={ShoppingBag}>
      {orders.status === "error" ? (
        <div className="space-y-3">
          <CardMessage>No hemos podido cargar tus pedidos.</CardMessage>
          <Button type="button" variant="outline" onClick={orders.reload}>
            Reintentar
          </Button>
        </div>
      ) : orders.status !== "ready" || !orders.data ? (
        <CardMessage>Cargando tus pedidos…</CardMessage>
      ) : orders.data.data.length === 0 ? (
        <div className="space-y-4">
          <CardMessage>
            Todavía no has hecho ningún pedido. Cuando hagas el primero, aquí verás su estado.
          </CardMessage>
          <Link href="/carta" className={buttonVariants()}>
            Ver la carta
          </Link>
        </div>
      ) : (
        <>
          <ul className="divide-border divide-y">
            {orders.data.data.map((order) => (
              <li
                key={order.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3"
              >
                <div>
                  <p className="font-semibold">
                    Pedido nº {order.orderNumber}{" "}
                    <span className="text-muted-foreground text-sm font-normal">
                      · {ORDER_TYPE_LABELS[order.type]}
                    </span>
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {dateFormat.format(new Date(order.createdAt))} ·{" "}
                    {order.itemCount === 1 ? "1 producto" : `${order.itemCount} productos`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="secondary">{ORDER_STATUS_LABELS[order.status]}</Badge>
                  <span className="font-bold">{formatEuro(order.total)}</span>
                </div>
              </li>
            ))}
          </ul>
          {orders.data.meta.total > orders.data.data.length ? (
            <CardMessage>
              Mostrando los {orders.data.data.length} últimos de {orders.data.meta.total} pedidos.
            </CardMessage>
          ) : null}
        </>
      )}
    </CardSection>
  );
}
