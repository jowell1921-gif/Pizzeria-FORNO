import { Gift, Star } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { SectionHeading } from "@/components/layout/section-heading";
import { buttonVariants } from "@/components/ui/button";
import { getLoyaltyProgram } from "@/features/catalog/api";
import { pointsRuleText } from "@/features/club/format";
import { cn } from "@/lib/utils";

async function ClubTeaserContent() {
  const program = await getLoyaltyProgram();
  const description = program.ok
    ? `Suma ${pointsRuleText(program.data.pointsPerEuro)} y canjea tus puntos por recompensas.`
    : "Suma puntos en cada pedido y canjéalos por recompensas.";
  const rewards = program.ok ? program.data.rewards : [];

  return (
    <div className="container-page grid items-center gap-8 lg:grid-cols-2">
      <div className="space-y-6">
        <SectionHeading
          id="club-title"
          eyebrow="Fidelización"
          title="FORNO CLUB"
          tone="light"
          description={description}
        />
        <Link
          href="/forno-club"
          transitionTypes={["nav-forward"]}
          className={cn(
            buttonVariants({ size: "lg" }),
            "bg-gold text-charcoal hover:bg-gold/85 tracking-wide uppercase",
          )}
        >
          Descubrir el club
        </Link>
      </div>

      {rewards.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
          {rewards.slice(0, 3).map((reward) => (
            <li key={reward.id} className="scroll-reveal border-cream/20 rounded-2xl border p-4">
              <Gift aria-hidden className="text-gold mb-2 size-6" />
              <p className="font-semibold">{reward.name}</p>
              <p className="text-gold mt-1 flex items-center gap-1 text-sm font-bold">
                <Star aria-hidden className="size-4" />
                {reward.pointsCost} puntos
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function ClubTeaser() {
  return (
    <section aria-labelledby="club-title" className="section-y bg-charcoal text-cream">
      <Suspense fallback={<div aria-hidden className="container-page min-h-48" />}>
        <ClubTeaserContent />
      </Suspense>
    </section>
  );
}
