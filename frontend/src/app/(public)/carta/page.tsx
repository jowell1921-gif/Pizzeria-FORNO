import type { Metadata } from "next";
import Image from "next/image";

import { PageTransition } from "@/components/layout/page-transition";
import { SectionHeading } from "@/components/layout/section-heading";
import { ProductCard } from "@/features/menu/product-card";
import { DEMO_CATEGORIES, DEMO_PRODUCTS } from "@/lib/demo-data";
import { IMAGES } from "@/lib/images";

export const metadata: Metadata = {
  title: "Carta",
  description: "Pizzas, entrantes, bebidas y postres de FORNO, con ingredientes y alérgenos.",
  alternates: { canonical: "/carta" },
};

export default function MenuPage() {
  return (
    <PageTransition>
      <div className="bg-cream-soft border-border border-b">
        <div className="container-page section-y grid items-center gap-8 md:grid-cols-2">
          <SectionHeading
            as="h1"
            eyebrow="Carta"
            title="Nuestra carta"
            description="Consulta ingredientes y alérgenos de cada producto. Precios con IVA incluido."
          />
          <Image
            src={IMAGES.pizzasMostrador.src}
            width={IMAGES.pizzasMostrador.width}
            height={IMAGES.pizzasMostrador.height}
            alt={IMAGES.pizzasMostrador.alt}
            sizes="(min-width: 768px) 50vw, 100vw"
            className="scroll-image h-40 w-full rounded-2xl object-cover sm:h-52 md:h-56"
          />
        </div>
      </div>

      <div className="border-border bg-background sticky top-16 z-30 border-b md:top-20">
        <nav aria-label="Categorías de la carta" className="container-page">
          <ul className="flex gap-2 overflow-x-auto py-3">
            {DEMO_CATEGORIES.map((category) => (
              <li key={category.id}>
                <a
                  href={`#${category.id}`}
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
        {DEMO_CATEGORIES.map((category) => {
          const products = DEMO_PRODUCTS.filter((product) => product.categoryId === category.id);
          return (
            <section
              key={category.id}
              id={category.id}
              aria-labelledby={`${category.id}-title`}
              className="scroll-mt-40 space-y-5 md:scroll-mt-44"
            >
              <SectionHeading
                id={`${category.id}-title`}
                title={category.name}
                description={category.description}
              />
              <div className="grid gap-4 lg:grid-cols-2">
                {products.map((product) => (
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
    </PageTransition>
  );
}
