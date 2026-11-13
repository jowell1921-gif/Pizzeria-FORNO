import type { Metadata } from "next";

import { PromotionsView } from "@/features/admin/promotions-view";
import { RequireSection } from "@/features/panel/panel-shell";

export const metadata: Metadata = { title: "Promociones" };

/**
 * Gestión de promociones y cupones. Lectura con `promotions:read`; modificar, con
 * `promotions:manage`.
 */
export default function AdminPromotionsViewPage() {
  return (
    <RequireSection read="promotions:read" manage="promotions:manage">
      <PromotionsView />
    </RequireSection>
  );
}
