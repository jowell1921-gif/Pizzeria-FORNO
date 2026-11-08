import type { Metadata } from "next";

import { KitchenBoard } from "@/features/panel/kitchen-board";
import { RequirePermission } from "@/features/panel/panel-shell";

export const metadata: Metadata = { title: "Cocina" };

export default function KitchenPage() {
  return (
    <RequirePermission permission="kitchen:orders:read">
      <KitchenBoard />
    </RequirePermission>
  );
}
