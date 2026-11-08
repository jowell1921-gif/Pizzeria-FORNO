import type { Metadata } from "next";
import { Suspense } from "react";

import { PageTransition } from "@/components/layout/page-transition";
import { SectionHeading } from "@/components/layout/section-heading";
import { OrderView } from "@/features/checkout/order-view";

export const metadata: Metadata = {
  title: "Tu pedido",
  robots: { index: false },
};

async function OrderContent({ params }: Pick<PageProps<"/pedido/[id]">, "params">) {
  const { id } = await params;
  return <OrderView orderId={id} />;
}

export default function OrderPage({ params }: PageProps<"/pedido/[id]">) {
  return (
    <PageTransition className="container-page section-y">
      <div className="space-y-8">
        <SectionHeading
          as="h1"
          eyebrow="Pedido"
          title="¡Gracias por tu pedido!"
          description="Aquí puedes seguir su estado. Se actualiza solo."
        />
        <Suspense fallback={<p className="text-muted-foreground">Cargando tu pedido…</p>}>
          <OrderContent params={params} />
        </Suspense>
      </div>
    </PageTransition>
  );
}
