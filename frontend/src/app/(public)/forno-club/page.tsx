import { Gift, ShoppingBag, Star } from "lucide-react";
import type { Metadata } from "next";

import { PageTransition } from "@/components/layout/page-transition";
import { SectionHeading } from "@/components/layout/section-heading";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { DEMO_LOYALTY } from "@/lib/demo-data";

export const metadata: Metadata = {
  title: "FORNO CLUB",
  description: "Acumula puntos en cada pedido y canjéalos por recompensas en FORNO.",
  alternates: { canonical: "/forno-club" },
};

const STEPS = [
  {
    icon: ShoppingBag,
    title: "Pide",
    text: "Haz tus pedidos con tu cuenta, para recoger o a domicilio.",
  },
  { icon: Star, title: "Suma", text: "Recibes puntos cuando el pedido se completa." },
  { icon: Gift, title: "Canjea", text: "Cambia tus puntos por las recompensas disponibles." },
] as const;

const FAQ = [
  {
    question: "¿Cuándo recibo los puntos?",
    answer:
      "Cuando el pedido pasa al estado completado. Si se cancela o se devuelve, los puntos se revierten.",
  },
  {
    question: "¿Todo el importe suma puntos?",
    answer:
      "En esta demostración no suman los gastos de envío ni los descuentos aplicados. Las reglas definitivas las configura el local.",
  },
  {
    question: "¿Los puntos caducan?",
    answer:
      "Depende de la configuración del local. Si hay caducidad, se indicará en tu historial de puntos.",
  },
] as const;

export default function ClubPage() {
  return (
    <PageTransition>
      <div className="bg-charcoal text-cream">
        <div className="container-page section-y">
          <SectionHeading
            as="h1"
            tone="light"
            eyebrow="Fidelización"
            title="FORNO CLUB"
            description={`Por cada euro de tus pedidos sumas ${DEMO_LOYALTY.pointsPerEuro} punto (valor de ejemplo, configurable por el local).`}
          />
        </div>
      </div>

      <section aria-labelledby="club-steps" className="container-page section-y space-y-8">
        <SectionHeading id="club-steps" title="Cómo funciona" />
        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, text }, index) => (
            <li
              key={title}
              className="scroll-reveal border-border bg-card space-y-2 rounded-2xl border p-6"
            >
              <Icon aria-hidden className="text-tomato-strong size-7" />
              <h3 className="text-2xl leading-none font-bold">
                {index + 1}. {title}
              </h3>
              <p className="text-muted-foreground text-sm">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="club-rewards" className="bg-cream-soft section-y">
        <div className="container-page space-y-8">
          <SectionHeading
            id="club-rewards"
            title="Recompensas"
            description="Ejemplos de recompensas y puntos necesarios."
          />
          <ul className="grid gap-4 md:grid-cols-3">
            {DEMO_LOYALTY.rewards.map((reward) => (
              <li
                key={reward.id}
                className="scroll-reveal border-border bg-card rounded-2xl border p-6"
              >
                <p className="text-2xl font-bold">{reward.name}</p>
                <p className="text-tomato-deep mt-1 font-bold">{reward.points} puntos</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="club-faq" className="container-page section-y space-y-6">
        <SectionHeading id="club-faq" title="Preguntas frecuentes" />
        <Accordion className="max-w-3xl">
          {FAQ.map((item) => (
            <AccordionItem key={item.question} value={item.question}>
              <AccordionTrigger>{item.question}</AccordionTrigger>
              <AccordionContent>{item.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </PageTransition>
  );
}
