import { formatEuro } from "@/lib/format";

import type { Quote } from "./quote";

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      className={strong ? "flex justify-between text-lg font-bold" : "flex justify-between text-sm"}
    >
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** Desglose de importes tal como los calcula el servidor. Los precios incluyen IVA. */
export function CartTotals({ quote }: { quote: Quote }) {
  const { totals } = quote;
  const hasDiscount = Number(totals.discount) > 0;
  return (
    <div className="space-y-2">
      <dl className="space-y-2" aria-label="Resumen de importes">
        <Row label="Subtotal" value={formatEuro(totals.subtotal)} />
        {hasDiscount ? <Row label="Descuentos" value={`-${formatEuro(totals.discount)}`} /> : null}
        {quote.type === "DELIVERY" ? (
          <Row label="Gastos de envío" value={formatEuro(totals.deliveryFee)} />
        ) : null}
        <Row label="Total" value={formatEuro(totals.total)} strong />
      </dl>
      <p className="text-muted-foreground text-xs">IVA incluido ({formatEuro(totals.tax)}).</p>
    </div>
  );
}
