import Link from "next/link";

import { SectionHeading } from "@/components/layout/section-heading";
import { buttonVariants } from "@/components/ui/button";
import { DEMO_PRODUCTS } from "@/lib/demo-data";
import { ProductCard } from "@/features/menu/product-card";

export function PopularProducts() {
  const popular = DEMO_PRODUCTS.filter((product) => product.popular && product.available).slice(
    0,
    4,
  );

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
        <div className="grid gap-4 md:grid-cols-2">
          {popular.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </section>
  );
}
