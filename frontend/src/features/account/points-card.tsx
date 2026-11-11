"use client";

import { Check, Gift, Lock } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { FormError, FormSuccess } from "@/features/auth/form-parts";
import { ApiError } from "@/lib/api";

import { CardMessage, CardSection } from "./card-section";
import {
  fetchLoyaltyAccount,
  fetchRecentTransactions,
  fetchRewards,
  redeemReward,
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

function redeemErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "INSUFFICIENT_POINTS")
      return "No tienes puntos suficientes para esta recompensa.";
    if (error.code === "REWARD_OUT_OF_STOCK") return "Esta recompensa se ha agotado.";
    if (error.status === 404) return "Esta recompensa ya no está disponible.";
    if (error.code === "NETWORK_ERROR")
      return "No se pudo conectar con el servidor. Inténtalo de nuevo.";
  }
  return "No hemos podido canjear la recompensa. Inténtalo de nuevo.";
}

interface PointsCardProps {
  /** Se llama tras canjear una recompensa (para refrescar «Mis recompensas»). */
  onRedeemed?: () => void;
}

/** Puntos de FORNO CLUB: saldo, progreso, recompensas que se pueden canjear y últimos movimientos. */
export function PointsCard({ onRedeemed }: PointsCardProps = {}) {
  const { token } = useProfile();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Misma recompensa => misma clave: reintentar tras un fallo de red no descuenta los puntos dos veces.
  const attempt = useRef<{ rewardId: string; key: string } | null>(null);
  const account = useApiResource(token, fetchLoyaltyAccount);
  const rewards = useApiResource(token, fetchRewards);
  const movements = useApiResource(token, fetchRecentTransactions);

  async function redeem(rewardId: string, name: string) {
    if (!token) return;
    setRedeeming(true);
    setError(null);
    setMessage(null);
    if (attempt.current?.rewardId !== rewardId) {
      attempt.current = { rewardId, key: crypto.randomUUID() };
    }
    try {
      await redeemReward(token, rewardId, attempt.current.key);
      attempt.current = null;
      setConfirmingId(null);
      setMessage(
        `Has canjeado «${name}». La encontrarás en «Mis recompensas» y podrás usarla al finalizar tu pedido.`,
      );
      account.reload();
      rewards.reload();
      movements.reload();
      onRedeemed?.();
    } catch (caught) {
      setError(redeemErrorMessage(caught));
      if (caught instanceof ApiError && caught.status < 500 && caught.status !== 0)
        attempt.current = null;
    } finally {
      setRedeeming(false);
    }
  }

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
                      {unlocked && reward.inStock ? (
                        confirmingId === reward.id ? (
                          <span className="flex flex-wrap items-center justify-end gap-2">
                            <Button
                              type="button"
                              size="sm"
                              disabled={redeeming}
                              onClick={() => void redeem(reward.id, reward.name)}
                            >
                              {redeeming
                                ? "Canjeando…"
                                : `Confirmar (${pointsText(reward.pointsCost)})`}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={redeeming}
                              onClick={() => setConfirmingId(null)}
                            >
                              No
                            </Button>
                          </span>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => {
                              setMessage(null);
                              setError(null);
                              setConfirmingId(reward.id);
                            }}
                          >
                            Canjear · {reward.pointsCost}
                            <span className="sr-only"> puntos: {reward.name}</span>
                          </Button>
                        )
                      ) : (
                        <span className="text-muted-foreground">
                          {unlocked ? "Agotada" : pointsText(reward.pointsCost)}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
              {message ? <FormSuccess>{message}</FormSuccess> : null}
              <FormError>{error}</FormError>
              <p className="text-muted-foreground mt-2 text-xs">
                Al canjear una recompensa se descuentan los puntos y pasa a «Mis recompensas»; la
                eliges al finalizar tu pedido. Si cancelas ese pedido, recuperas los puntos.
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
