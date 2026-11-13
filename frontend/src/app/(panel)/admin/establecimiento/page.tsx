import type { Metadata } from "next";

import { StoreView } from "@/features/admin/store-view";
import { RequireSection } from "@/features/panel/panel-shell";

export const metadata: Metadata = { title: "Establecimiento" };

/**
 * Ajustes del local: datos, horarios, zonas de reparto y pagos. Lectura con `settings:read`;
 * modificar, con `settings:manage`.
 */
export default function AdminStoreViewPage() {
  return (
    <RequireSection read="settings:read" manage="settings:manage">
      <StoreView />
    </RequireSection>
  );
}
