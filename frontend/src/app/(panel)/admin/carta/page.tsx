import type { Metadata } from "next";

import { CatalogView } from "@/features/admin/catalog-view";
import { RequirePermission } from "@/features/panel/panel-shell";

export const metadata: Metadata = { title: "Carta" };

export default function AdminCatalogViewPage() {
  return (
    <RequirePermission permission="catalog:manage">
      <CatalogView />
    </RequirePermission>
  );
}
