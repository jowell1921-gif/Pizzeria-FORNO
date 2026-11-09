import type { Metadata } from "next";

import { StoreView } from "@/features/admin/store-view";
import { RequirePermission } from "@/features/panel/panel-shell";

export const metadata: Metadata = { title: "Establecimiento" };

export default function AdminStoreViewPage() {
  return (
    <RequirePermission permission="settings:manage">
      <StoreView />
    </RequirePermission>
  );
}
