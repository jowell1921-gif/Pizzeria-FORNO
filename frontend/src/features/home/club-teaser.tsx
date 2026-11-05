import { Gift, Star } from "lucide-react";
import Link from "next/link";

import { SectionHeading } from "@/components/layout/section-heading";
import { buttonVariants } from "@/components/ui/button";
import { DEMO_LOYALTY } from "@/lib/demo-data";
import { cn } from "@/lib/utils";

export function ClubTeaser() {
  return (
    <section aria-labelledby="club-title" className="section-y bg-charcoal text-cream">
      <div className="container-page grid items-center gap-8 lg:grid-cols-2">
        <div className="space-y-6">
          <SectionHeading
            id="club-title"
            eyebrow="Fidelización"
            title="FORNO CLUB"
            tone="light"
            description={`Suma ${DEMO_LOYALTY.pointsPerEuro} punto por cada euro (valor de ejemplo) y canjéalos por bebidas, entrantes y pizzas gratis.`}
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

        <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
          {DEMO_LOYALTY.rewards.map((reward) => (
            <li key={reward.id} className="scroll-reveal border-cream/20 rounded-2xl border p-4">
              <Gift aria-hidden className="text-gold mb-2 size-6" />
              <p className="font-semibold">{reward.name}</p>
              <p className="text-gold mt-1 flex items-center gap-1 text-sm font-bold">
                <Star aria-hidden className="size-4" />
                {reward.points} puntos
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
