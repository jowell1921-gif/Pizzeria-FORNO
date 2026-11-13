import type { Metadata } from "next";

import { PageTransition } from "@/components/layout/page-transition";
import { SectionHeading } from "@/components/layout/section-heading";
import { AccountPanel } from "@/features/account/account-panel";

export const metadata: Metadata = {
  title: "Mi cuenta",
  robots: { index: false },
};

/** «Mi cuenta»: datos, direcciones, pedidos, puntos y seguridad. Exige sesión (ver proxy.ts). */
export default function AccountPage() {
  return (
    <PageTransition className="container-page section-y">
      <div className="space-y-8">
        <SectionHeading
          as="h1"
          eyebrow="Mi cuenta"
          title="Tu cuenta FORNEA"
          description="Tus datos, puntos, pedidos y direcciones en un solo lugar."
        />
        <AccountPanel />
      </div>
    </PageTransition>
  );
}
