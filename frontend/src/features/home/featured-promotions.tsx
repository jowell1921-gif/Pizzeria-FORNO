import Link from "next/link";
import { Suspense } from "react";

import { SectionHeading } from "@/components/layout/section-heading";
import { buttonVariants } from "@/components/ui/button";
import { getPromotions } from "@/features/catalog/api";
import { CatalogSkeleton, CatalogUnavailable } from "@/features/catalog/catalog-unavailable";
import { PromotionCard } from "@/features/promotions/promotion-card";

async function PromotionsList() {
  const result = await getPromotions();
  if (!result.ok) return <CatalogUnavailable what="las promociones" />;
  if (result.data.length === 0) {
    return <p className="text-muted-foreground text-sm">Ahora mismo no hay promociones activas.</p>;
  }
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {result.data.slice(0, 3).map((promotion) => (
        <PromotionCard key={promotion.id} promotion={promotion} />
      ))}
    </div>
  );
}

/** Promociones destacadas de la home (salen de la API). */
export function FeaturedPromotions() {
  return (
    <section aria-labelledby="promos-title" className="section-y bg-cream-soft">
      <div className="container-page space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <SectionHeading id="promos-title" eyebrow="Ofertas" title="Promociones destacadas" />
          <Link
            href="/promociones"
            transitionTypes={["nav-forward"]}
            className={buttonVariants({ variant: "outline" })}
          >
            Todas las promociones
          </Link>
        </div>
        <Suspense fallback={<CatalogSkeleton className="h-48" />}>
          <PromotionsList />
        </Suspense>
      </div>
    </section>
  );
}
