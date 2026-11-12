import type { Metadata } from "next";

import { NotificationsView } from "@/features/admin/notifications-view";
import { RequirePermission } from "@/features/panel/panel-shell";

export const metadata: Metadata = { title: "Correos" };

export default function AdminNotificationsPage() {
  return (
    <RequirePermission permission="settings:read">
      <NotificationsView />
    </RequirePermission>
  );
}
