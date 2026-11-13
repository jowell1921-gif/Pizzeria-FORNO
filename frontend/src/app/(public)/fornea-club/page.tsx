import { Gift, ShoppingBag, Star } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { AmbientParticles } from "@/components/brand/ambient-particles";
import { PageTransition } from "@/components/layout/page-transition";
import { SectionHeading } from "@/components/layout/section-heading";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { getLoyaltyProgram } from "@/features/catalog/api";
import { CatalogSkeleton, CatalogUnavailable } from "@/features/catalog/catalog-unavailable";
import { pointsRuleText } from "@/features/club/format";

export const metadata: Metadata = {
  title: "FORNEA CLUB",
  description: "Acumula puntos en cada pedido y canjéalos por recompensas en FORNEA.",
  alternates: { canonical: "/fornea-club" },
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
      "Cuando el pedido pasa al estado completado. Si se cancela o se devuelve, se retiran los puntos que habías ganado (sin dejar tu saldo en negativo) y se te devuelven los que gastaste en una recompensa.",
  },
  {
    question: "¿Todo el importe suma puntos?",
    answer:
      "Suman los productos de tu pedido una vez descontadas las promociones y las recompensas que hayas usado. Los gastos de envío no suman puntos. La conversión de euros a puntos la configura el local.",
  },
  {
    question: "¿Los puntos caducan?",
    answer:
      "Depende de la configuración del local. Si hay caducidad, se indicará en tu historial de puntos.",
  },
] as const;

function ClubHeading({ description }: { description: string | undefined }) {
  return (
    <SectionHeading
      as="h1"
      tone="light"
      eyebrow="Fidelización"
      title="FORNEA CLUB"
      description={description}
    />
  );
}

async function ClubIntro() {
  const program = await getLoyaltyProgram();
  return (
    <ClubHeading
      description={
        program.ok
          ? `Por cada euro de tus pedidos sumas ${pointsRuleText(program.data.pointsPerEuro).replace(" por cada euro", "")} (configurable por el local).`
          : "Suma puntos en cada pedido y canjéalos por recompensas."
      }
    />
  );
}

async function ClubRewards() {
  const program = await getLoyaltyProgram();
  if (!program.ok) return <CatalogUnavailable what="las recompensas" />;
  if (program.data.rewards.length === 0) {
    return <p className="text-muted-foreground">Ahora mismo no hay recompensas disponibles.</p>;
  }
  return (
    <ul className="grid gap-4 md:grid-cols-3">
      {program.data.rewards.map((reward) => (
        <li key={reward.id} className="scroll-reveal border-border bg-card rounded-2xl border p-6">
          <p className="text-2xl font-bold">{reward.name}</p>
          {reward.description ? (
            <p className="text-muted-foreground mt-1 text-sm">{reward.description}</p>
          ) : null}
          <p className="text-tomato-deep mt-1 font-bold">{reward.pointsCost} puntos</p>
          {reward.inStock ? null : (
            <p className="text-muted-foreground mt-1 text-xs">Agotada de momento</p>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Página pública del programa de fidelización: cómo funciona, recompensas y condiciones. */
export default function ClubPage() {
  return (
    <PageTransition>
      <div className="bg-charcoal text-cream relative isolate overflow-hidden">
        <AmbientParticles />
        <div className="container-page section-y">
          <Suspense fallback={<ClubHeading description={undefined} />}>
            <ClubIntro />
          </Suspense>
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
            description="Canjea tus puntos desde «Mi cuenta» y úsalas en tu próximo pedido."
          />
          <Suspense fallback={<CatalogSkeleton className="h-40" />}>
            <ClubRewards />
          </Suspense>
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
