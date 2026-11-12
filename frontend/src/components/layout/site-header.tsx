import { Suspense } from "react";

import { Logo } from "@/components/brand/logo";
import { MainNav } from "@/components/layout/main-nav";

export function SiteHeader() {
  return (
    <header
      style={{ viewTransitionName: "site-header" }}
      className="border-border bg-background/95 sticky top-0 z-40 border-b backdrop-blur"
    >
      <div className="container-page flex h-20 items-center justify-between gap-4 md:h-24">
        <Logo />
        {/* La navegación lee la ruta actual: en rutas con parámetros (p. ej. /pedido/[id]) debe ir en Suspense. */}
        <Suspense fallback={<div aria-hidden className="h-11" />}>
          <MainNav />
        </Suspense>
      </div>
    </header>
  );
}
