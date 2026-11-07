"use client";

import { Check, Gift, Lock } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

import { CardMessage, CardSection } from "./card-section";
import {
  fetchLoyaltyAccount,
  fetchRecentTransactions,
  fetchRewards,
  TRANSACTION_LABELS,
} from "./loyalty";
import { useProfile } from "./profile-context";
import { useApiResource } from "./use-api-resource";

function pointsText(points: number): string {
  return `${points} ${Math.abs(points) === 1 ? "punto" : "puntos"}`;
}

const dateFormat = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** Puntos de FORNO CLUB: saldo, progreso hacia la siguiente recompensa y últimos movimientos. */
export function PointsCard() {
  const { token } = useProfile();
  const account = useApiResource(token, fetchLoyaltyAccount);
  const rewards = useApiResource(token, fetchRewards);
  const movements = useApiResource(token, fetchRecentTransactions);

  const failed = account.status === "error" || rewards.status === "error";
  const ready = account.status === "ready" && rewards.status === "ready";

  return (
    <CardSection id="points-title" title="Mis puntos FORNO CLUB" icon={Gift}>
      {failed ? (
        <div className="space-y-3">
          <CardMessage>No hemos podido cargar tus puntos.</CardMessage>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              account.reload();
              rewards.reload();
              movements.reload();
            }}
          >
            Reintentar
          </Button>
        </div>
      ) : !ready || !account.data || !rewards.data ? (
        <CardMessage>Cargando tus puntos…</CardMessage>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
            <p
              className="font-heading text-tomato-deep text-7xl leading-none font-extrabold"
              data-testid="points-balance"
            >
              {account.data.balance}
            </p>
            <p className="text-muted-foreground pb-2 text-base">
              {account.data.balance === 1 ? "punto acumulado" : "puntos acumulados"}
            </p>
          </div>

          {account.data.nextReward ? (
            <div className="space-y-2">
              <div
                role="progressbar"
                aria-label={`Progreso hacia ${account.data.nextReward.name}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(account.data.nextReward.progress * 100)}
                className="bg-cream h-3 overflow-hidden rounded-full"
              >
                <div
                  className="bg-tomato-strong h-full rounded-full transition-[width] duration-700"
                  style={{ width: `${Math.round(account.data.nextReward.progress * 100)}%` }}
                />
              </div>
              <p className="text-sm">
                Te faltan <strong>{pointsText(account.data.nextReward.pointsMissing)}</strong> para{" "}
                <strong>{account.data.nextReward.name}</strong>.
              </p>
            </div>
          ) : rewards.data.length > 0 ? (
            <p className="text-sm font-semibold">
              ¡Has alcanzado todas las recompensas disponibles!
            </p>
          ) : null}

          {rewards.data.length > 0 ? (
            <div>
              <h3 className="mb-2 text-lg leading-none font-bold">Recompensas</h3>
              <ul className="space-y-2">
                {rewards.data.map((reward) => {
                  const unlocked = account.data!.balance >= reward.pointsCost;
                  return (
                    <li
                      key={reward.id}
                      className="border-border flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm"
                    >
                      <span className="flex items-center gap-2 font-semibold">
                        {unlocked ? (
                          <Check aria-hidden className="text-tomato-strong size-4" />
                        ) : (
                          <Lock aria-hidden className="text-muted-foreground size-4" />
                        )}
                        {reward.name}
                      </span>
                      <span
                        className={
                          unlocked ? "text-tomato-deep font-bold" : "text-muted-foreground"
                        }
                      >
                        {unlocked ? "Disponible" : pointsText(reward.pointsCost)}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="text-muted-foreground mt-2 text-xs">
                Podrás canjearlas al hacer tu pedido (disponible muy pronto).
              </p>
            </div>
          ) : null}

          <div>
            <h3 className="mb-2 text-lg leading-none font-bold">Últimos movimientos</h3>
            {movements.status === "ready" && movements.data && movements.data.length > 0 ? (
              <ul className="divide-border divide-y text-sm">
                {movements.data.map((movement) => (
                  <li key={movement.id} className="flex items-center justify-between gap-3 py-2">
                    <span>
                      <span className="font-semibold">{TRANSACTION_LABELS[movement.type]}</span>
                      {movement.orderNumber ? ` · pedido nº ${movement.orderNumber}` : ""}
                      <span className="text-muted-foreground block text-xs">
                        {dateFormat.format(new Date(movement.createdAt))}
                      </span>
                    </span>
                    <span
                      className={movement.points > 0 ? "text-tomato-deep font-bold" : "font-bold"}
                    >
                      {movement.points > 0 ? "+" : ""}
                      {movement.points}
                    </span>
                  </li>
                ))}
              </ul>
            ) : movements.status === "loading" ? (
              <CardMessage>Cargando movimientos…</CardMessage>
            ) : (
              <CardMessage>Todavía no tienes movimientos. Suma puntos con cada pedido.</CardMessage>
            )}
          </div>

          <p className="text-muted-foreground text-xs">
            {account.data.pointsPerEuro
              ? `Sumas ${account.data.pointsPerEuro} ${account.data.pointsPerEuro === "1" ? "punto" : "puntos"} por cada euro de tus pedidos (valor de ejemplo). `
              : ""}
            {account.data.expiryDays
              ? `Los puntos caducan a los ${account.data.expiryDays} días. `
              : "Tus puntos no caducan. "}
            <Link
              href="/forno-club"
              className="text-tomato-strong font-semibold underline underline-offset-4"
            >
              Cómo funciona FORNO CLUB
            </Link>
          </p>
        </>
      )}
    </CardSection>
  );
}
