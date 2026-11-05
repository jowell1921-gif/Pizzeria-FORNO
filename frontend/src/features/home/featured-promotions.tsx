import Link from "next/link";

import { SectionHeading } from "@/components/layout/section-heading";
import { buttonVariants } from "@/components/ui/button";
import { PromotionCard } from "@/features/promotions/promotion-card";
import { DEMO_PROMOTIONS } from "@/lib/demo-data";

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
        <div className="grid gap-4 md:grid-cols-3">
          {DEMO_PROMOTIONS.map((promotion) => (
            <PromotionCard key={promotion.id} promotion={promotion} />
          ))}
        </div>
      </div>
    </section>
  );
}
