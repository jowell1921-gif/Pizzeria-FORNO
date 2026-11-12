import { Suspense } from "react";

import { CartProvider } from "@/features/cart/cart-provider";
import { PizzaiAssistant } from "@/features/assistant/pizzai-assistant";
import { AdminOfferDialog } from "@/features/account/admin-role";
import { ProfileProvider } from "@/features/account/profile-context";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <a
        href="#contenido"
        className="bg-charcoal text-cream sr-only z-50 rounded-md px-4 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Saltar al contenido
      </a>
      <ProfileProvider>
        <CartProvider>
          <SiteHeader />
          <main id="contenido" className="flex-1">
            {children}
          </main>
          <SiteFooter />
          <AdminOfferDialog />
          {/* Lee la ruta actual: en rutas con parámetros debe ir en Suspense. */}
          <Suspense fallback={null}>
            <PizzaiAssistant />
          </Suspense>
        </CartProvider>
      </ProfileProvider>
    </>
  );
}
