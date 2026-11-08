import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";

import { PageTransition } from "@/components/layout/page-transition";
import { SectionHeading } from "@/components/layout/section-heading";
import { getCategories, getProducts } from "@/features/catalog/api";
import { CatalogSkeleton, CatalogUnavailable } from "@/features/catalog/catalog-unavailable";
import { ProductCard } from "@/features/menu/product-card";
import { IMAGES } from "@/lib/images";

export const metadata: Metadata = {
  title: "Carta",
  description: "Pizzas, entrantes, bebidas y postres de FORNO, con ingredientes y alérgenos.",
  alternates: { canonical: "/carta" },
};

async function MenuContent() {
  const [categories, products] = await Promise.all([getCategories(), getProducts()]);
  if (!categories.ok || !products.ok) {
    return (
      <div className="container-page py-10">
        <CatalogUnavailable what="la carta" />
      </div>
    );
  }

  return (
    <>
      <div className="border-border bg-background sticky top-16 z-30 border-b md:top-20">
        <nav aria-label="Categorías de la carta" className="container-page">
          <ul className="flex gap-2 overflow-x-auto py-3">
            {categories.data.map((category) => (
              <li key={category.id}>
                <a
                  href={`#${category.slug}`}
                  className="border-foreground/50 hover:bg-cream inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold whitespace-nowrap"
                >
                  {category.name}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="container-page space-y-14 py-10">
        {categories.data.map((category) => {
          const items = products.data.filter((product) => product.categorySlug === category.slug);
          if (items.length === 0) return null;
          return (
            <section
              key={category.id}
              id={category.slug}
              aria-labelledby={`${category.slug}-title`}
              className="scroll-mt-40 space-y-5 md:scroll-mt-44"
            >
              <SectionHeading
                id={`${category.slug}-title`}
                title={category.name}
                description={category.description ?? undefined}
              />
              <div className="grid gap-4 lg:grid-cols-2">
                {items.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </section>
          );
        })}

        <p className="text-muted-foreground border-border rounded-xl border border-dashed p-4 text-sm">
          La información de alérgenos es orientativa en esta demostración. Si tienes alguna alergia
          o intolerancia, consúltanos antes de realizar el pedido.
        </p>
      </div>
    </>
  );
}

export default function MenuPage() {
  return (
    <PageTransition>
      <div className="bg-cream-soft border-border border-b">
        <div className="container-page section-y grid items-center gap-8 md:grid-cols-2">
          <SectionHeading
            as="h1"
            eyebrow="Carta"
            title="Nuestra carta"
            description="Elige tu pizza, personalízala y añádela a tu pedido. Precios con IVA incluido."
          />
          <div className="banner-enter">
            <div className="banner-breathe">
              <Image
                src={IMAGES.cartaBanner.src}
                width={IMAGES.cartaBanner.width}
                height={IMAGES.cartaBanner.height}
                alt={IMAGES.cartaBanner.alt}
                sizes="(min-width: 768px) 50vw, 100vw"
                priority
                className="mx-auto h-auto max-h-64 w-full object-contain drop-shadow-2xl md:max-h-72"
              />
            </div>
          </div>
        </div>
      </div>

      <Suspense
        fallback={
          <div className="container-page py-10">
            <CatalogSkeleton className="h-96" />
          </div>
        }
      >
        <MenuContent />
      </Suspense>
    </PageTransition>
  );
}
