"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { MAIN_NAV } from "@/lib/site";
import { cn } from "@/lib/utils";

const FORWARD = ["nav-forward"];
const BACK = ["nav-back"];

/** La portada solo está activa en «/»; el resto, en su ruta y sus subrutas. */
function isActive(pathname: string, href: string): boolean {
  if (href.includes("#")) return false;
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** Volver a la portada se anima como «atrás»; el resto, como «adelante». */
function transitionFor(href: string): string[] {
  return href === "/" ? BACK : FORWARD;
}

export function MainNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <nav aria-label="Navegación principal" className="hidden items-center gap-1 md:flex">
        {MAIN_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            transitionTypes={transitionFor(item.href)}
            aria-current={isActive(pathname, item.href) ? "page" : undefined}
            className={cn(
              "hover:text-tomato-strong rounded-md px-3 py-2 text-sm font-semibold transition-colors",
              isActive(pathname, item.href) ? "text-tomato-strong" : "text-charcoal",
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="flex items-center gap-2">
        <Link
          href="/carta"
          transitionTypes={FORWARD}
          className={cn(buttonVariants({ size: "default" }), "tracking-wide uppercase")}
        >
          Pedir ahora
        </Link>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            render={
              <Button variant="outline" size="icon" className="md:hidden" aria-label="Abrir menú" />
            }
          >
            <Menu aria-hidden className="size-5" />
          </SheetTrigger>
          <SheetContent side="right" className="bg-cream-soft">
            <SheetTitle className="font-heading px-4 pt-5 text-2xl font-extrabold uppercase">
              Menú
            </SheetTitle>
            <SheetDescription className="sr-only">Navegación principal del sitio</SheetDescription>
            <nav aria-label="Navegación principal (móvil)" className="flex flex-col gap-1 px-2">
              {MAIN_NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  transitionTypes={transitionFor(item.href)}
                  onClick={() => setOpen(false)}
                  aria-current={isActive(pathname, item.href) ? "page" : undefined}
                  className="hover:bg-cream rounded-lg px-3 py-3 text-base font-semibold"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
