"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useProfile } from "@/features/account/profile-context";
import { useApiResource } from "@/features/account/use-api-resource";
import { FormError } from "@/features/auth/form-parts";
import { API_URL, ApiError } from "@/lib/api";

import { fetchOrderDocuments, orderErrorMessage, requestInvoice } from "./order";

const date = new Intl.DateTimeFormat("es-ES", { dateStyle: "long" });

/** Descarga un PDF con la sesión del usuario (no se puede con un simple enlace: hace falta el token). */
export async function downloadPdf(token: string, orderId: string, type: "ticket" | "invoice") {
  const response = await fetch(
    `${API_URL}/orders/${encodeURIComponent(orderId)}/documents/${type}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { code?: string };
    } | null;
    throw new ApiError(response.status, payload?.error?.code ?? "UNKNOWN_ERROR", "Download failed");
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = `${type === "ticket" ? "ticket" : "factura"}-${orderId.slice(0, 8)}.pdf`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Ticket y factura de un pedido ya cobrado. */
export function DocumentsSection({ orderId }: { orderId: string }) {
  const { token } = useProfile();
  const [load] = useState(() => (accessToken: string) => fetchOrderDocuments(accessToken, orderId));
  const documents = useApiResource(token, load);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [form, setForm] = useState({ name: "", taxId: "", address: "" });

  if (documents.status !== "ready" || !documents.data) return null;
  const { settled, documents: issued } = documents.data;
  if (!settled) return null;
  const invoice = issued.find((item) => item.type === "INVOICE");

  async function run(label: string, action: () => Promise<unknown>) {
    setBusy(label);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(orderErrorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  const filled =
    form.name.trim().length >= 2 &&
    form.taxId.trim().length >= 5 &&
    form.address.trim().length >= 5;

  return (
    <section
      aria-labelledby="order-documents"
      className="border-border bg-card space-y-4 rounded-2xl border p-5"
    >
      <h2 id="order-documents" className="text-2xl leading-none font-bold">
        Ticket y factura
      </h2>
      <FormError>{error}</FormError>
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={busy !== null}
          onClick={() =>
            void run("ticket", () =>
              token ? downloadPdf(token, orderId, "ticket") : Promise.resolve(),
            )
          }
        >
          {busy === "ticket" ? "Preparando…" : "Descargar ticket (PDF)"}
        </Button>
        {invoice ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy !== null}
            onClick={() =>
              void run("invoice", () =>
                token ? downloadPdf(token, orderId, "invoice") : Promise.resolve(),
              )
            }
          >
            {busy === "invoice" ? "Preparando…" : `Descargar factura ${invoice.number}`}
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={() => setAsking((value) => !value)}>
            Solicitar factura
          </Button>
        )}
      </div>
      {invoice ? (
        <p className="text-muted-foreground text-sm">
          Factura {invoice.number} emitida el {date.format(new Date(invoice.issuedAt))}.
        </p>
      ) : null}

      {asking && !invoice ? (
        <form
          noValidate
          aria-label="Datos para la factura"
          onSubmit={(event) => {
            event.preventDefault();
            if (!token || !filled) return;
            void run("request", async () => {
              await requestInvoice(token, orderId, {
                name: form.name.trim(),
                taxId: form.taxId.trim(),
                address: form.address.trim(),
              });
              setAsking(false);
              documents.reload();
            });
          }}
          className="border-border grid gap-3 rounded-xl border p-4 sm:grid-cols-2"
        >
          <p className="text-muted-foreground text-sm sm:col-span-2">
            La factura se emite una sola vez y no se puede modificar después: revisa los datos.
          </p>
          {(
            [
              ["name", "Nombre o razón social"],
              ["taxId", "NIF / CIF"],
              ["address", "Dirección fiscal"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className={key === "address" ? "sm:col-span-2" : undefined}>
              <label htmlFor={`invoice-${key}`} className="mb-1 block text-sm font-semibold">
                {label}
              </label>
              <input
                id={`invoice-${key}`}
                value={form[key]}
                onChange={(event) =>
                  setForm((current) => ({ ...current, [key]: event.target.value }))
                }
                className="border-border bg-background h-11 w-full rounded-lg border px-3 text-sm"
              />
            </div>
          ))}
          <div className="sm:col-span-2">
            <Button type="submit" disabled={!filled || busy !== null}>
              {busy === "request" ? "Emitiendo…" : "Emitir factura"}
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
