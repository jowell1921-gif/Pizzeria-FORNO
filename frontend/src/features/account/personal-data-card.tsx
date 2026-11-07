"use client";

import { Pencil, UserRound } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { FormSuccess } from "@/features/auth/form-parts";

import { CardSection } from "./card-section";
import { useProfile } from "./profile-context";
import { ProfileDataForm } from "./profile-data-form";

/** Datos personales del cliente, con edición en la propia tarjeta. */
export function PersonalDataCard() {
  const { profile, token, setProfile } = useProfile();
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!profile || !token) return null;

  const rows: Array<[string, string]> = [
    ["Nombre completo", profile.fullName],
    ["Nombre de usuario", profile.username ?? "—"],
    ["Correo electrónico", profile.email],
    ["Teléfono", profile.phone ?? "—"],
  ];
  const settings: Array<[string, string]> = [
    ["Ofertas y novedades por correo", profile.marketingConsent ? "Activadas" : "Desactivadas"],
  ];

  return (
    <CardSection id="data-title" title="Mis datos" icon={UserRound}>
      {editing ? (
        <ProfileDataForm
          profile={profile}
          token={token}
          mode="edit"
          onSaved={(updated) => {
            setProfile(updated);
            setEditing(false);
            setSaved(true);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="space-y-5">
          {saved ? <FormSuccess>Cambios guardados.</FormSuccess> : null}
          <DataList rows={rows} />
          <div className="border-border border-t pt-4">
            <h3 className="mb-3 text-lg leading-none font-bold">Ajustes</h3>
            <DataList rows={settings} />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setSaved(false);
              setEditing(true);
            }}
          >
            <Pencil aria-hidden />
            Editar datos
          </Button>
        </div>
      )}
    </CardSection>
  );
}

function DataList({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="space-y-3 text-sm">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            {label}
          </dt>
          <dd className="font-medium break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
