import type { Metadata } from "next";

import { PanelShell } from "@/features/panel/panel-shell";

export const metadata: Metadata = {
  title: { default: "Panel del personal", template: "%s · Panel FORNO" },
  robots: { index: false, follow: false },
};

export default function PanelLayout({ children }: LayoutProps<"/">) {
  return <PanelShell>{children}</PanelShell>;
}
