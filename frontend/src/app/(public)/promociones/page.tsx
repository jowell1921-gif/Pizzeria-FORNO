import type { Metadata } from "next";
import { Suspense } from "react";

import { FornoWatermark } from "@/components/brand/forno-watermark";
import { PageTransition } from "@/components/layout/page-transition";
import { SectionHeading } from "@/components/layout/section-heading";
import { getPromotions } from "@/features/catalog/api";
import { CatalogSkeleton, CatalogUnavailable } from "@/features/catalog/catalog-unavailable";
import { PromotionCard } from "@/features/promotions/promotion-card";

export const metadata: Metadata = {
  title: "Promociones",
  description: "Ofertas, combos y descuentos vigentes en FORNO, con sus condiciones.",
  alternates: { canonical: "/promociones" },
};

async function PromotionsList() {
  const result = await getPromotions();
  if (!result.ok) return <CatalogUnavailable what="las promociones" />;
  if (result.data.length === 0) {
    return <p className="text-muted-foreground">Ahora mismo no hay promociones activas.</p>;
  }
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {result.data.map((promotion) => (
        <PromotionCard key={promotion.id} promotion={promotion} showConditions headingAs="h2" />
      ))}
    </div>
  );
}

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
        <Suspense fallback={<CatalogSkeleton />}>
          <PromotionsList />
        </Suspense>
      </div>
    </PageTransition>
  );
}
