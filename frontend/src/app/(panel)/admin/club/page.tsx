import type { Metadata } from "next";

import { ClubView } from "@/features/admin/club-view";
import { RequirePermission } from "@/features/panel/panel-shell";

export const metadata: Metadata = { title: "FORNEA CLUB" };

export default function AdminClubViewPage() {
  return (
    <RequirePermission permission="loyalty:manage">
      <ClubView />
    </RequirePermission>
  );
}
