import type { Metadata } from "next";

import { FornoWatermark } from "@/components/brand/forno-watermark";
import { PageTransition } from "@/components/layout/page-transition";
import { SectionHeading } from "@/components/layout/section-heading";
import { PromotionCard } from "@/features/promotions/promotion-card";
import { DEMO_PROMOTIONS } from "@/lib/demo-data";

export const metadata: Metadata = {
  title: "Promociones",
  description: "Ofertas, combos y descuentos vigentes en FORNO, con sus condiciones.",
  alternates: { canonical: "/promociones" },
};

export default function PromotionsPage() {
  return (
    <PageTransition className="relative isolate overflow-hidden">
      <FornoWatermark tone="light" className="top-6" />
      <div className="container-page section-y space-y-8">
        <SectionHeading
          as="h1"
          eyebrow="Ofertas"
          title="Promociones"
          description="Cada promoción indica su vigencia y sus condiciones. La elegibilidad se valida al hacer el pedido."
        />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {DEMO_PROMOTIONS.map((promotion) => (
            <PromotionCard key={promotion.id} promotion={promotion} showConditions />
          ))}
        </div>
      </div>
    </PageTransition>
  );
}
