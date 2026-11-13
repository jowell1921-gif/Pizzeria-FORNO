import type { Metadata } from "next";

import { DashboardView } from "@/features/panel/dashboard-view";
import { RequirePermission } from "@/features/panel/panel-shell";

export const metadata: Metadata = { title: "Panel de control" };

/** Panel de control del personal: resumen de la actividad del día. */
export default function AdminPage() {
  return (
    <RequirePermission permission="dashboard:read">
      <DashboardView />
    </RequirePermission>
  );
}
