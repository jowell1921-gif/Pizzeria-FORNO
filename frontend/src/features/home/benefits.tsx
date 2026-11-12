import { Clock, Gift, ReceiptText, Smartphone } from "lucide-react";

import { SectionHeading } from "@/components/layout/section-heading";

const BENEFITS = [
  {
    icon: Smartphone,
    title: "Pide en pocos pasos",
    text: "Elige, confirma y recoge. Pensado para hacerlo desde el móvil.",
  },
  {
    icon: ReceiptText,
    title: "Precios transparentes",
    text: "Ves el total, el envío y los descuentos antes de confirmar.",
  },
  {
    icon: Gift,
    title: "Puntos en cada pedido",
    text: "Pedir directamente te da puntos canjeables en FORNEA CLUB.",
  },
  {
    icon: Clock,
    title: "Tiempos claros",
    text: "Te indicamos el tiempo estimado de preparación o de entrega.",
  },
] as const;

export function Benefits() {
  return (
    <section aria-labelledby="benefits-title" className="section-y">
      <div className="container-page space-y-8">
        <SectionHeading
          id="benefits-title"
          eyebrow="Ventajas"
          title="Pedir directamente compensa"
        />
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {BENEFITS.map(({ icon: Icon, title, text }) => (
            <li
              key={title}
              className="scroll-reveal card-interactive border-border bg-card space-y-2 rounded-2xl border p-5"
            >
              <Icon aria-hidden className="text-tomato-strong size-7" />
              <h3 className="text-2xl leading-none font-bold">{title}</h3>
              <p className="text-muted-foreground text-sm">{text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
