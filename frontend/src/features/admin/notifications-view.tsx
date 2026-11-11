"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useProfile } from "@/features/account/profile-context";

import { fetchNotifications } from "./admin-api";
import { Field, PageTitle, QueryState, Section, fieldClass } from "./admin-ui";

const dateTime = new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short" });

const STATUS_LABELS = {
  PENDING: "Pendiente",
  SENT: "Enviado",
  FAILED: "Fallido",
  LOGGED: "Registrado (no enviado)",
} as const;

const TEMPLATE_LABELS: Record<string, string> = {
  ORDER_CONFIRMED: "Pedido recibido",
  ORDER_ACCEPTED: "Pedido aceptado",
  ORDER_REJECTED: "Pedido rechazado",
  ORDER_READY: "Listo para recoger",
  ORDER_OUT_FOR_DELIVERY: "Pedido enviado",
  ORDER_COMPLETED: "Pedido completado",
  ORDER_CANCELLED: "Pedido cancelado",
};

/**
 * Correos de pedido: los enviados y los que solo se han registrado (sin proveedor de correo, o con
 * un destinatario no permitido en este entorno de pruebas).
 */
export function NotificationsView() {
  const { token } = useProfile();
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["admin-data", "notifications", status, q, page],
    queryFn: () =>
      fetchNotifications(token ?? "", {
        page,
        pageSize: 10,
        ...(status ? { status } : {}),
        ...(q ? { q } : {}),
      }),
    enabled: token !== null,
    placeholderData: keepPreviousData,
  });
  const meta = query.data?.meta;

  return (
    <div className="space-y-6">
      <PageTitle>Correos</PageTitle>
      <Section title="Avisos de pedido">
        <p className="text-muted-foreground text-sm">
          «Registrado» significa que el correo se ha redactado y guardado, pero no se ha enviado: o
          no hay proveedor de correo configurado, o el destinatario no está permitido en este
          entorno de pruebas. Aquí puedes leer lo que habría recibido el cliente.
        </p>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            setQ(search.trim());
            setPage(1);
          }}
          className="grid gap-3 sm:grid-cols-[2fr_1fr_auto]"
        >
          <Field label="Buscar por destinatario">
            {(id) => (
              <input
                id={id}
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className={fieldClass}
              />
            )}
          </Field>
          <Field label="Estado">
            {(id) => (
              <select
                id={id}
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
                className={fieldClass}
              >
                <option value="">Todos</option>
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <div className="flex items-end">
            <Button type="submit" variant="outline" className="h-11 w-full">
              Buscar
            </Button>
          </div>
        </form>

        <QueryState query={query}>
          {query.data && query.data.data.length === 0 ? (
            <p className="text-muted-foreground text-sm">No hay correos.</p>
          ) : (
            <ul className="space-y-2" aria-label="Correos">
              {query.data?.data.map((row) => (
                <li key={row.id} className="border-border rounded-xl border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">{row.subject ?? row.template}</p>
                      <p className="text-muted-foreground text-xs">
                        {TEMPLATE_LABELS[row.template] ?? row.template} · para {row.recipient}
                        {row.orderNumber ? ` · pedido #${row.orderNumber}` : ""} ·{" "}
                        {dateTime.format(new Date(row.createdAt))}
                      </p>
                    </div>
                    <Badge variant={row.status === "FAILED" ? "destructive" : "secondary"}>
                      {STATUS_LABELS[row.status]}
                    </Badge>
                  </div>
                  {row.lastError ? (
                    <p className="text-destructive mt-1 text-xs">
                      Intento {row.attempts}: {row.lastError}
                    </p>
                  ) : null}
                  {row.body ? (
                    <details className="mt-1">
                      <summary className="min-h-8 cursor-pointer text-sm font-medium">
                        Leer el correo
                      </summary>
                      <pre className="bg-cream-soft mt-1 overflow-x-auto rounded-lg p-3 text-xs whitespace-pre-wrap">
                        {row.body}
                      </pre>
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
              Página {meta.page} de {meta.totalPages} · {meta.total} correos
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
