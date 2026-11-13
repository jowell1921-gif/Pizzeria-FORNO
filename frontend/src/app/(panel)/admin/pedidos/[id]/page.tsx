import type { Metadata } from "next";
import { Suspense } from "react";

import { OrderDetailView } from "@/features/panel/order-detail-view";
import { RequirePermission } from "@/features/panel/panel-shell";

export const metadata: Metadata = { title: "Pedido" };

async function Detail({ params }: Pick<PageProps<"/admin/pedidos/[id]">, "params">) {
  const { id } = await params;
  return <OrderDetailView orderId={id} />;
}

/** Detalle de un pedido: datos, historial y cambios de estado (también reembolsos si hay permiso). */
export default function AdminOrderPage({ params }: PageProps<"/admin/pedidos/[id]">) {
  return (
    <RequirePermission permission="orders:read:all">
      <Suspense fallback={<p className="text-muted-foreground">Cargando el pedido…</p>}>
        <Detail params={params} />
      </Suspense>
    </RequirePermission>
  );
}
