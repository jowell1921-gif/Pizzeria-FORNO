import { CalendarDays } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { Promotion } from "@/types/menu";

interface PromotionCardProps {
  promotion: Promotion;
  showConditions?: boolean;
}

export function PromotionCard({ promotion, showConditions = false }: PromotionCardProps) {
  const headingId = `promo-${promotion.id}`;

  return (
    <article
      aria-labelledby={headingId}
      className="scroll-reveal card-interactive border-border bg-cream flex h-full flex-col gap-3 rounded-2xl border p-6"
    >
      <Badge className="bg-charcoal text-cream w-fit">{promotion.badge}</Badge>
      <h3 id={headingId} className="text-3xl leading-none font-bold">
        {promotion.title}
      </h3>
      <p className="text-sm">{promotion.description}</p>

      {promotion.code ? (
        <p className="text-sm">
          Código:{" "}
          <code className="bg-background rounded-md border px-2 py-1 font-mono font-bold">
            {promotion.code}
          </code>
        </p>
      ) : null}

      <p className="text-muted-foreground mt-auto flex items-center gap-2 text-xs">
        <CalendarDays aria-hidden className="size-4 shrink-0" />
        {promotion.validity}
      </p>

      {showConditions ? (
        <div>
          <p className="text-sm font-semibold">Condiciones</p>
          <ul className="text-muted-foreground mt-1 list-disc space-y-1 pl-5 text-sm">
            {promotion.conditions.map((condition) => (
              <li key={condition}>{condition}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}
