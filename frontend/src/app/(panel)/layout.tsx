import type { Metadata } from "next";

import { PanelShell } from "@/features/panel/panel-shell";

export const metadata: Metadata = {
  title: { default: "Panel del personal", template: "%s · Panel FORNEA" },
  robots: { index: false, follow: false },
};

/** Marco del panel del personal: cabecera, navegación según permisos y sesión. */
export default function PanelLayout({ children }: LayoutProps<"/">) {
  return <PanelShell>{children}</PanelShell>;
}
