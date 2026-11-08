"use client";

import Link from "next/link";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { AddressesCard } from "./addresses-card";
import { OrdersCard } from "./orders-card";
import { PersonalDataCard } from "./personal-data-card";
import { PointsCard } from "./points-card";
import { PromoCodeCard } from "./promo-code-card";
import { ROLE_LABELS } from "./profile";
import { RedemptionsCard } from "./redemptions-card";
import { useProfile } from "./profile-context";
import { SecurityCard } from "./security-card";
import { SignOutButton } from "./sign-out-button";

const memberSinceFormat = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" });

/** Panel de «Mi cuenta» para clientes con los datos completos. */
export function AccountDashboard() {
  const { profile } = useProfile();
  // Al canjear una recompensa se vuelve a cargar «Mis recompensas».
  const [redemptionsVersion, setRedemptionsVersion] = useState(0);
  if (!profile) return null;

  const displayName = profile.username ?? profile.fullName;

  return (
    <div className="space-y-6">
      <section
        aria-label="Resumen de tu cuenta"
        className="bg-charcoal text-cream flex flex-col gap-4 rounded-2xl p-6 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-center gap-4">
          <span
            aria-hidden
            className="bg-tomato-strong font-heading flex size-16 shrink-0 items-center justify-center rounded-full text-4xl font-extrabold text-white uppercase"
          >
            {displayName.charAt(0)}
          </span>
          <div className="min-w-0">
            <p className="font-heading text-4xl leading-none font-extrabold break-words uppercase">
              Hola, {displayName}
            </p>
            <p className="text-cream/80 mt-1 text-sm break-all">{profile.email}</p>
            <p className="text-cream/70 text-xs">
              Cliente desde {memberSinceFormat.format(new Date(profile.createdAt))}
            </p>
            {profile.roles.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {profile.roles.map((role) => (
                  <Badge key={role} className="bg-gold text-charcoal">
                    {ROLE_LABELS[role]}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:items-end">
          <Link
            href="/carta"
            transitionTypes={["nav-forward"]}
            className={cn(buttonVariants({ size: "lg" }), "tracking-wide uppercase")}
          >
            Pedir ahora
          </Link>
          <SignOutButton className="border-cream/40 text-cream hover:bg-cream/10 hover:text-cream bg-transparent" />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-6">
          <PointsCard onRedeemed={() => setRedemptionsVersion((value) => value + 1)} />
          <RedemptionsCard key={redemptionsVersion} />
          <PromoCodeCard />
          <OrdersCard />
        </div>
        <div className="space-y-6">
          <PersonalDataCard />
          <AddressesCard />
          <SecurityCard />
        </div>
      </div>
    </div>
  );
}
