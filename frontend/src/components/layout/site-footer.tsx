"use cache";

import { Clock, MapPin, Phone } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { DEMO_OPENING_HOURS, DEMO_STORE } from "@/lib/demo-data";
import { LEGAL_PAGES, MAIN_NAV } from "@/lib/site";

export async function SiteFooter() {
  return (
    <footer className="bg-charcoal text-cream">
      <div className="container-page grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-3">
          <Logo variant="wordmark" />
          <p className="text-cream/80 text-sm">{DEMO_STORE.tagline}</p>
        </div>

        <nav aria-label="Pie de página" className="space-y-3">
          <h2 className="text-gold text-lg font-bold">Navegación</h2>
          <ul className="space-y-2 text-sm">
            {MAIN_NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  transitionTypes={["nav-forward"]}
                  className="hover:text-gold underline-offset-4 hover:underline"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-3">
          <h2 className="text-gold text-lg font-bold">Contacto</h2>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />
              {DEMO_STORE.address}
            </li>
            <li className="flex items-center gap-2">
              <Phone aria-hidden className="size-4 shrink-0" />
              <a
                href={DEMO_STORE.phoneHref}
                className="hover:text-gold underline-offset-4 hover:underline"
              >
                {DEMO_STORE.phone}
              </a>
            </li>
          </ul>
        </div>

        <div className="space-y-3">
          <h2 className="text-gold text-lg font-bold">Horario</h2>
          <ul className="space-y-2 text-sm">
            {DEMO_OPENING_HOURS.map((period) => (
              <li key={period.days} className="flex items-start gap-2">
                <Clock aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>
                  <span className="font-semibold">{period.days}:</span> {period.hours}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-cream/20 border-t">
        <div className="container-page flex flex-col gap-3 py-6 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} FORNO. Proyecto de demostración.</p>
          <nav aria-label="Información legal">
            <ul className="flex flex-wrap gap-x-4 gap-y-2">
              {LEGAL_PAGES.map((page) => (
                <li key={page.slug}>
                  <Link
                    href={`/legal/${page.slug}`}
                    transitionTypes={["nav-forward"]}
                    className="hover:text-gold underline underline-offset-4"
                  >
                    {page.title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  );
}
