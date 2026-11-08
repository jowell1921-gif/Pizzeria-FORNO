import type { Metadata } from "next";

import { PageTransition } from "@/components/layout/page-transition";
import { SectionHeading } from "@/components/layout/section-heading";
import { CheckoutFlow } from "@/features/checkout/checkout-flow";

export const metadata: Metadata = {
  title: "Finalizar pedido",
  robots: { index: false },
};

export default function CheckoutPage() {
  return (
    <PageTransition className="container-page section-y">
      <div className="space-y-8">
        <SectionHeading
          as="h1"
          eyebrow="Pedido"
          title="Finalizar pedido"
          description="Elige cómo y cuándo lo quieres. Los importes los calcula el servidor; precios con IVA incluido."
        />
        <CheckoutFlow />
      </div>
    </PageTransition>
  );
}
