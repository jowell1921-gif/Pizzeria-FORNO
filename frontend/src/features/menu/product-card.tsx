import { Leaf } from "lucide-react";
import Image from "next/image";

import { PizzaIllustration } from "@/components/brand/pizza-illustration";
import { Badge } from "@/components/ui/badge";
import { ALLERGEN_LABELS } from "@/lib/allergens";
import { formatEuro } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Product } from "@/types/menu";

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const headingId = `product-${product.id}`;

  return (
    <article
      aria-labelledby={headingId}
      className={cn(
        "scroll-reveal card-interactive border-border bg-card flex gap-4 rounded-2xl border p-4 shadow-sm",
        !product.available && "bg-muted border-dashed",
      )}
    >
      <div className="bg-cream-soft flex size-20 shrink-0 items-center justify-center rounded-xl p-1.5 sm:size-24 sm:p-2">
        {product.image ? (
          <Image
            src={product.image.src}
            width={product.image.width}
            height={product.image.height}
            alt={product.image.alt}
            sizes="96px"
            className="h-auto w-full"
          />
        ) : (
          <PizzaIllustration />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <h3 id={headingId} className="text-2xl leading-none font-bold">
            {product.name}
          </h3>
          <p className="text-lg font-bold whitespace-nowrap">{formatEuro(product.price)}</p>
        </div>

        <p className="text-muted-foreground text-sm">{product.description}</p>

        {product.ingredients.length > 0 ? (
          <p className="text-sm">
            <span className="font-semibold">Ingredientes: </span>
            {product.ingredients.join(", ")}
          </p>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          {product.vegetarian ? (
            <Badge variant="secondary" className="gap-1">
              <Leaf aria-hidden className="size-3" />
              Vegetariano
            </Badge>
          ) : null}
          {!product.available ? <Badge variant="outline">No disponible</Badge> : null}
          {product.allergens.length > 0 ? (
            <p className="text-muted-foreground text-xs">
              <span className="font-semibold">Alérgenos: </span>
              {product.allergens.map((id) => ALLERGEN_LABELS[id]).join(", ")}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}
