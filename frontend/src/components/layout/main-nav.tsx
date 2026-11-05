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

function isActive(pathname: string, href: string): boolean {
  return !href.includes("#") && pathname.startsWith(href);
}

export function MainNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <nav aria-label="Principal" className="hidden items-center gap-1 md:flex">
        {MAIN_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            transitionTypes={FORWARD}
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
            <nav aria-label="Principal (móvil)" className="flex flex-col gap-1 px-2">
              {MAIN_NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  transitionTypes={FORWARD}
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
