import type { Metadata } from "next";

import { PromotionsView } from "@/features/admin/promotions-view";
import { RequirePermission } from "@/features/panel/panel-shell";

export const metadata: Metadata = { title: "Promociones" };

export default function AdminPromotionsViewPage() {
  return (
    <RequirePermission permission="promotions:manage">
      <PromotionsView />
    </RequirePermission>
  );
}
