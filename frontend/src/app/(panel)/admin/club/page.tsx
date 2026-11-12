import type { Metadata } from "next";

import { ClubView } from "@/features/admin/club-view";
import { RequireSection } from "@/features/panel/panel-shell";

export const metadata: Metadata = { title: "FORNEA CLUB" };

export default function AdminClubViewPage() {
  return (
    <RequireSection read="loyalty:read" manage="loyalty:manage">
      <ClubView />
    </RequireSection>
  );
}
