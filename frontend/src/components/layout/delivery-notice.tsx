import { Bike } from "lucide-react";

import { DELIVERY_NOTICE } from "@/lib/demo-data";
import { cn } from "@/lib/utils";

/** Aviso visible de dónde se reparte. */
export function DeliveryNotice({ className }: { className?: string }) {
  return (
    <p
      role="note"
      className={cn(
        "bg-cream-soft border-border flex items-start gap-3 rounded-xl border px-4 py-3 text-sm",
        className,
      )}
    >
      <Bike aria-hidden className="text-tomato-strong mt-0.5 size-5 shrink-0" />
      <span>
        <strong>{DELIVERY_NOTICE.title}:</strong> {DELIVERY_NOTICE.text}
      </span>
    </p>
  );
}
