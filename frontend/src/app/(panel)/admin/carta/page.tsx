import type { Metadata } from "next";

import { CatalogView } from "@/features/admin/catalog-view";
import { RequireSection } from "@/features/panel/panel-shell";

export const metadata: Metadata = { title: "Carta" };

/**
 * Gestión de la carta. Se ve con `catalog:read`; modificar exige `catalog:manage` (si no, modo
 * lectura).
 */
export default function AdminCatalogViewPage() {
  return (
    <RequireSection read="catalog:read" manage="catalog:manage">
      <CatalogView />
    </RequireSection>
  );
}
