import type { Metadata } from "next";

import { NotificationsView } from "@/features/admin/notifications-view";
import { RequirePermission } from "@/features/panel/panel-shell";

export const metadata: Metadata = { title: "Correos" };

/** Correos de pedido enviados o registrados, y su estado. Solo lectura (`settings:read`). */
export default function AdminNotificationsPage() {
  return (
    <RequirePermission permission="settings:read">
      <NotificationsView />
    </RequirePermission>
  );
}
