import { AnimatedNumber } from "@/components/ui/animated-number";
import { DEMO_LOYALTY, DEMO_PRODUCTS, DEMO_STORE } from "@/lib/demo-data";

/** Cifras derivadas de la configuración y la carta, no datos inventados. */
function buildStats() {
  const cheapestReward = Math.min(...DEMO_LOYALTY.rewards.map((reward) => reward.points));
  return [
    { value: DEMO_STORE.prepTimeMinutes, unit: "min", label: "de preparación estimada" },
    { value: DEMO_STORE.deliveryTimeMinutes, unit: "min", label: "de entrega a domicilio" },
    {
      value: DEMO_PRODUCTS.filter((product) => product.available).length,
      unit: "",
      label: "productos en la carta",
    },
    { value: cheapestReward, unit: "pts", label: "para tu primera recompensa" },
  ] as const;
}

export function Stats() {
  const stats = buildStats();

  return (
    <section aria-label="FORNO en cifras" className="border-border bg-cream border-y">
      <dl className="container-page grid grid-cols-2 gap-x-4 gap-y-8 py-10 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="text-center">
            <dt className="sr-only">{stat.label}</dt>
            <dd className="text-charcoal font-heading text-5xl leading-none font-extrabold sm:text-6xl">
              <AnimatedNumber value={stat.value} />
              {stat.unit ? (
                <span className="text-tomato-deep ml-1 text-2xl sm:text-3xl">{stat.unit}</span>
              ) : null}
              <span
                aria-hidden
                className="text-muted-foreground mt-2 block font-sans text-sm font-medium tracking-normal normal-case"
              >
                {stat.label}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
