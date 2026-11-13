import type { Metadata } from "next";

import { ClubView } from "@/features/admin/club-view";
import { RequireSection } from "@/features/panel/panel-shell";

export const metadata: Metadata = { title: "FORNEA CLUB" };

/** Gestión de FORNEA CLUB. Lectura con `loyalty:read`; modificar, con `loyalty:manage`. */
export default function AdminClubViewPage() {
  return (
    <RequireSection read="loyalty:read" manage="loyalty:manage">
      <ClubView />
    </RequireSection>
  );
}
