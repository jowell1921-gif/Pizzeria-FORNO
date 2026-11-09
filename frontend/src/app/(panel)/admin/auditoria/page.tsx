import type { Metadata } from "next";

import { AuditView } from "@/features/admin/audit-view";
import { RequirePermission } from "@/features/panel/panel-shell";

export const metadata: Metadata = { title: "Auditoría" };

export default function AdminAuditViewPage() {
  return (
    <RequirePermission permission="audit:read">
      <AuditView />
    </RequirePermission>
  );
}
