import { DeliveryNotice } from "@/components/layout/delivery-notice";
import { Clock, MapPin, Phone } from "lucide-react";

import { SectionHeading } from "@/components/layout/section-heading";
import { DEMO_OPENING_HOURS, DEMO_STORE } from "@/lib/demo-data";
import { formatEuro } from "@/lib/format";

/** Información del local en la home: dirección, horario, tiempos y condiciones de reparto. */
export function StoreInfo() {
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(DEMO_STORE.mapsQuery)}`;

  return (
    <section
      id="ubicacion"
      aria-labelledby="store-title"
      className="section-y bg-cream-soft scroll-mt-24"
    >
      <div className="container-page space-y-8">
        <SectionHeading id="store-title" eyebrow="Visítanos" title="Dónde estamos" />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="scroll-reveal border-border bg-card space-y-3 rounded-2xl border p-6">
            <MapPin aria-hidden className="text-tomato-strong size-6" />
            <h3 className="text-2xl leading-none font-bold">Dirección</h3>
            <p className="text-sm">{DEMO_STORE.address}</p>
            <a
              href={mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-tomato-strong inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4"
            >
              Abrir en el mapa<span className="sr-only"> (se abre en una pestaña nueva)</span>
            </a>
            <p className="flex items-center gap-2 text-sm">
              <Phone aria-hidden className="size-4" />
              <a href={DEMO_STORE.phoneHref} className="underline underline-offset-4">
                {DEMO_STORE.phone}
              </a>
            </p>
          </div>

          <div className="scroll-reveal border-border bg-card space-y-3 rounded-2xl border p-6">
            <Clock aria-hidden className="text-tomato-strong size-6" />
            <h3 className="text-2xl leading-none font-bold">Horario</h3>
            <dl className="space-y-2 text-sm">
              {DEMO_OPENING_HOURS.map((period) => (
                <div key={period.days}>
                  <dt className="font-semibold">{period.days}</dt>
                  <dd className="text-muted-foreground">{period.hours}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="scroll-reveal border-border bg-card space-y-3 rounded-2xl border p-6">
            <h3 className="text-2xl leading-none font-bold">Pedidos</h3>
            <ul className="space-y-2 text-sm">
              <li>Preparación estimada: {DEMO_STORE.prepTimeMinutes} min</li>
              <li>Entrega a domicilio: {DEMO_STORE.deliveryTimeMinutes} min aprox.</li>
              <li>Pedido mínimo a domicilio: {formatEuro(DEMO_STORE.minimumOrder)}</li>
              <li>Gastos de envío: {formatEuro(DEMO_STORE.deliveryFee)}</li>
              <li>Envío gratis desde {formatEuro(DEMO_STORE.freeDeliveryFrom)}</li>
            </ul>
            <DeliveryNotice />
          </div>
        </div>
      </div>
    </section>
  );
}
