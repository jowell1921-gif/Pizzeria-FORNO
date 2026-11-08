"use client";

import { ShoppingBag } from "lucide-react";
import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import { CartLines } from "./cart-lines";
import { cartItemCount, useCartStore, useCartUi } from "./cart-store";
import { CartTotals } from "./cart-totals";
import { useCartQuote } from "./use-cart-quote";

function CartContents() {
  const lines = useCartStore((state) => state.lines);
  const clear = useCartStore((state) => state.clear);
  const setOpen = useCartUi((state) => state.setOpen);
  const quote = useCartQuote({ type: "PICKUP" });

  if (lines.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <ShoppingBag aria-hidden className="text-muted-foreground size-10" />
        <p className="font-semibold">Tu pedido está vacío</p>
        <p className="text-muted-foreground text-sm">Añade pizzas, entrantes, bebidas o postres.</p>
        <Link href="/carta" onClick={() => setOpen(false)} className={buttonVariants()}>
          Ver la carta
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-4">
        <CartLines quote={quote.data} />
      </div>
      <div className="border-border space-y-4 border-t p-4">
        {quote.isError ? (
          <p role="alert" className="text-destructive text-sm font-medium">
            No hemos podido calcular el importe. Alguno de los productos puede haber cambiado:
            quítalo y vuelve a añadirlo.
          </p>
        ) : quote.data ? (
          <>
            <CartTotals quote={quote.data} />
            <p className="text-muted-foreground text-xs">
              Los gastos de envío se calculan en el siguiente paso, según tu dirección.
            </p>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">Calculando importe…</p>
        )}
        <Link
          href="/pedido"
          onClick={() => setOpen(false)}
          className={cn(buttonVariants({ size: "lg" }), "w-full tracking-wide uppercase")}
        >
          Finalizar pedido
        </Link>
        <Button type="button" variant="ghost" className="w-full" onClick={clear}>
          Vaciar pedido
        </Button>
      </div>
    </>
  );
}

/** Botón del carrito en la cabecera, con el número de unidades, y su panel lateral. */
export function CartSheet() {
  const open = useCartUi((state) => state.open);
  const setOpen = useCartUi((state) => state.setOpen);
  const count = useCartStore((state) => cartItemCount(state.lines));

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="outline"
            size="icon"
            className="relative"
            aria-label={count > 0 ? `Tu pedido, ${count} unidades` : "Tu pedido, vacío"}
          />
        }
      >
        <ShoppingBag aria-hidden className="size-5" />
        {count > 0 ? (
          <span
            aria-hidden
            className="bg-tomato-strong absolute -top-2 -right-2 flex min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold text-white"
          >
            {count}
          </span>
        ) : null}
      </SheetTrigger>
      <SheetContent side="right" className="bg-background w-full sm:max-w-md">
        <SheetTitle className="font-heading px-4 pt-5 text-2xl font-extrabold uppercase">
          Tu pedido
        </SheetTitle>
        <SheetDescription className="sr-only">
          Productos de tu pedido, cantidades e importes
        </SheetDescription>
        <CartContents />
      </SheetContent>
    </Sheet>
  );
}
