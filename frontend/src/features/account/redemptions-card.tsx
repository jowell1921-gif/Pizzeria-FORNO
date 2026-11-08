"use client";

import { Ticket } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";

import { CardMessage, CardSection } from "./card-section";
import { benefitText, fetchRedemptions, REDEMPTION_STATUS_LABELS } from "./loyalty";
import { useProfile } from "./profile-context";
import { useApiResource } from "./use-api-resource";

const dateFormat = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const loadAll = (token: string) => fetchRedemptions(token);

/** «Mis recompensas»: las recompensas canjeadas, listas para usar en un pedido, y las ya usadas. */
export function RedemptionsCard() {
  const { token } = useProfile();
  const redemptions = useApiResource(token, loadAll);

  const available = (redemptions.data ?? []).filter((item) => item.status === "AVAILABLE");
  const past = (redemptions.data ?? []).filter((item) => item.status !== "AVAILABLE");

  return (
    <CardSection id="redemptions-title" title="Mis recompensas" icon={Ticket}>
      {redemptions.status === "error" ? (
        <div className="space-y-3">
          <CardMessage>No hemos podido cargar tus recompensas.</CardMessage>
          <Button type="button" variant="outline" onClick={redemptions.reload}>
            Reintentar
          </Button>
        </div>
      ) : redemptions.status !== "ready" ? (
        <CardMessage>Cargando tus recompensas…</CardMessage>
      ) : available.length === 0 && past.length === 0 ? (
        <CardMessage>
          Todavía no has canjeado ninguna recompensa. Cuando tengas puntos suficientes, canjéalas
          arriba.
        </CardMessage>
      ) : (
        <div className="space-y-5">
          {available.length > 0 ? (
            <div className="space-y-3">
              <ul className="space-y-2">
                {available.map((item) => (
                  <li
                    key={item.id}
                    className="border-tomato-strong bg-cream-soft rounded-xl border px-3 py-2 text-sm"
                  >
                    <p className="font-semibold">{item.rewardName}</p>
                    <p className="text-muted-foreground">{benefitText(item.benefit)}</p>
                  </li>
                ))}
              </ul>
              <p className="text-sm">Elige la recompensa al finalizar tu pedido.</p>
              <Link href="/carta" className={buttonVariants({ variant: "outline" })}>
                Hacer un pedido
              </Link>
            </div>
          ) : (
            <CardMessage>No tienes recompensas disponibles ahora mismo.</CardMessage>
          )}

          {past.length > 0 ? (
            <div>
              <h3 className="mb-2 text-lg leading-none font-bold">Historial</h3>
              <ul className="divide-border divide-y text-sm">
                {past.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 py-2">
                    <span>
                      <span className="font-semibold">{item.rewardName}</span>
                      <span className="text-muted-foreground block text-xs">
                        {dateFormat.format(new Date(item.createdAt))}
                        {item.orderNumber ? ` · pedido nº ${item.orderNumber}` : ""}
                      </span>
                    </span>
                    <Badge variant="secondary">{REDEMPTION_STATUS_LABELS[item.status]}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </CardSection>
  );
}
