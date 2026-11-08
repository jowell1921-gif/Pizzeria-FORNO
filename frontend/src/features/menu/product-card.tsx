"use client";

import { Leaf } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import { PizzaIllustration } from "@/components/brand/pizza-illustration";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Product } from "@/features/catalog/schemas";
import { formatEuro } from "@/lib/format";
import { cn } from "@/lib/utils";

import { ProductConfigurator } from "./product-configurator";

interface ProductCardProps {
  product: Product;
}

function ProductImage({
  product,
  sizes,
  className,
}: {
  product: Product;
  sizes: string;
  className?: string;
}) {
  return product.image ? (
    <Image
      src={product.image.url}
      alt={product.image.alt}
      fill
      sizes={sizes}
      className={cn("object-contain", className)}
    />
  ) : (
    <PizzaIllustration />
  );
}

/** Tarjeta de producto. Al pulsarla se abre una ventana con la información completa y «Añadir al pedido». */
export function ProductCard({ product }: ProductCardProps) {
  const headingId = `product-${product.id}`;
  const [open, setOpen] = useState(false);
  const allergens = product.allergens.map((allergen) => allergen.name);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <article
        aria-labelledby={headingId}
        className={cn(
          "scroll-reveal card-interactive border-border bg-card relative flex gap-4 rounded-2xl border p-4 shadow-sm",
          !product.available && "bg-muted border-dashed",
        )}
      >
        <div className="bg-cream-soft relative size-20 shrink-0 rounded-xl p-1.5 sm:size-24 sm:p-2">
          <div className="relative size-full">
            <ProductImage product={product} sizes="96px" />
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <h3 id={headingId} className="text-2xl leading-none font-bold">
              <DialogTrigger className="focus-visible:after:ring-ring/60 cursor-pointer text-left outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-3">
                {product.name}
              </DialogTrigger>
            </h3>
            <p className="text-lg font-bold whitespace-nowrap">
              <span className="text-muted-foreground text-sm font-medium">desde </span>
              {formatEuro(product.price)}
            </p>
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
            {allergens.length > 0 ? (
              <p className="text-muted-foreground text-xs">
                <span className="font-semibold">Alérgenos: </span>
                {allergens.join(", ")}
              </p>
            ) : null}
          </div>
        </div>
      </article>

      <DialogContent>
        <div className="bg-cream-soft flex justify-center p-6 pb-2">
          <div className="relative aspect-[3/2] w-full max-w-xs">
            <ProductImage product={product} sizes="320px" className="drop-shadow-xl" />
          </div>
        </div>
        <div className="space-y-4 p-6">
          <div className="flex flex-wrap items-start justify-between gap-2 pr-12">
            <DialogTitle>{product.name}</DialogTitle>
            <p className="text-2xl font-bold">{formatEuro(product.price)}</p>
          </div>
          <DialogDescription className="text-foreground text-base">
            {product.description}
          </DialogDescription>

          <dl className="space-y-3 text-sm">
            {product.ingredients.length > 0 ? (
              <div>
                <dt className="font-semibold">Ingredientes</dt>
                <dd>{product.ingredients.join(", ")}</dd>
              </div>
            ) : null}
            <div>
              <dt className="font-semibold">Alérgenos</dt>
              <dd>{allergens.length > 0 ? allergens.join(", ") : "Sin alérgenos declarados"}</dd>
            </div>
          </dl>

          <ProductConfigurator product={product} onAdded={() => setOpen(false)} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
