import Link from "next/link";
import { Suspense } from "react";

import { SectionHeading } from "@/components/layout/section-heading";
import { buttonVariants } from "@/components/ui/button";
import { getProducts } from "@/features/catalog/api";
import { CatalogSkeleton, CatalogUnavailable } from "@/features/catalog/catalog-unavailable";
import { ProductCard } from "@/features/menu/product-card";

async function PopularList() {
  const result = await getProducts();
  if (!result.ok) return <CatalogUnavailable what="los productos" />;

  const popular = result.data.filter((product) => product.popular && product.available).slice(0, 4);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {popular.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}

export function PopularProducts() {
  return (
    <section aria-labelledby="popular-title" className="section-y">
      <div className="container-page space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <SectionHeading
            id="popular-title"
            eyebrow="Lo más pedido"
            title="Nuestros favoritos"
            description="Las recetas que más se repiten en cada pedido."
          />
          <Link
            href="/carta"
            transitionTypes={["nav-forward"]}
            className={buttonVariants({ variant: "outline" })}
          >
            Ver toda la carta
          </Link>
        </div>
        <Suspense fallback={<CatalogSkeleton />}>
          <PopularList />
        </Suspense>
      </div>
    </section>
  );
}
