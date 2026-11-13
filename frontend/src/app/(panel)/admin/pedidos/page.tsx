import type { Metadata } from "next";

import { OrdersListView } from "@/features/panel/orders-list-view";
import { RequirePermission } from "@/features/panel/panel-shell";

export const metadata: Metadata = { title: "Pedidos" };

/** Listado de pedidos para el personal, con filtros y paginación. */
export default function AdminOrdersPage() {
  return (
    <RequirePermission permission="orders:read:all">
      <OrdersListView />
    </RequirePermission>
  );
}
