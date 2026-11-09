"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useProfile } from "@/features/account/profile-context";

import { fetchAudit } from "./admin-api";
import { Field, PageTitle, QueryState, Section, fieldClass } from "./admin-ui";

const dateTime = new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "medium" });

const ENTITIES = [
  "Product",
  "Category",
  "StoreSettings",
  "Promotion",
  "Coupon",
  "Reward",
  "Order",
  "LoyaltyAccount",
  "DeliveryZone",
];

/** Registro de operaciones administrativas con los valores antes y después de cada cambio. */
export function AuditView() {
  const { token } = useProfile();
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["admin-data", "audit", entityType, action, page],
    queryFn: () =>
      fetchAudit(token ?? "", {
        page,
        pageSize: 15,
        ...(entityType ? { entityType } : {}),
        ...(action.trim() ? { action: action.trim() } : {}),
      }),
    enabled: token !== null,
    placeholderData: keepPreviousData,
  });
  const meta = query.data?.meta;

  return (
    <div className="space-y-6">
      <PageTitle>Auditoría</PageTitle>
      <Section title="Operaciones registradas">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Entidad">
            {(id) => (
              <select
                id={id}
                value={entityType}
                onChange={(event) => {
                  setEntityType(event.target.value);
                  setPage(1);
                }}
                className={fieldClass}
              >
                <option value="">Todas</option>
                {ENTITIES.map((entity) => (
                  <option key={entity} value={entity}>
                    {entity}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Acción empieza por" hint="Por ejemplo «product.» o «store.».">
            {(id) => (
              <input
                id={id}
                value={action}
                onChange={(event) => {
                  setAction(event.target.value);
                  setPage(1);
                }}
                className={fieldClass}
              />
            )}
          </Field>
        </div>
        <QueryState query={query}>
          {query.data && query.data.data.length === 0 ? (
            <p className="text-muted-foreground text-sm">No hay registros.</p>
          ) : (
            <ul className="space-y-2" aria-label="Registros de auditoría">
              {query.data?.data.map((entry) => (
                <li key={entry.id} className="border-border rounded-xl border p-3">
                  <p className="font-semibold">
                    <code>{entry.action}</code>{" "}
                    <span className="text-muted-foreground text-xs">
                      {entry.entityType}
                      {entry.entityId ? ` · ${entry.entityId.slice(0, 8)}` : ""}
                    </span>
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {dateTime.format(new Date(entry.createdAt))} ·{" "}
                    {entry.actor ? `${entry.actor.fullName} (${entry.actor.email})` : "Sistema"}
                    {entry.reason ? ` · ${entry.reason}` : ""}
                  </p>
                  {entry.before != null || entry.after != null ? (
                    <details className="mt-1">
                      <summary className="min-h-8 cursor-pointer text-sm font-medium">
                        Ver cambios
                      </summary>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <pre className="bg-cream-soft overflow-x-auto rounded-lg p-2 text-xs">
                          {"Antes\n" + JSON.stringify(entry.before ?? null, null, 2)}
                        </pre>
                        <pre className="bg-cream-soft overflow-x-auto rounded-lg p-2 text-xs">
                          {"Después\n" + JSON.stringify(entry.after ?? null, null, 2)}
                        </pre>
                      </div>
                    </details>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </QueryState>
        {meta && meta.totalPages > 1 ? (
          <nav aria-label="Paginación" className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Anterior
            </Button>
            <p className="text-muted-foreground text-sm">
              Página {meta.page} de {meta.totalPages} · {meta.total} registros
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={page >= meta.totalPages}
              onClick={() => setPage(page + 1)}
            >
              Siguiente
            </Button>
          </nav>
        ) : null}
      </Section>
    </div>
  );
}
