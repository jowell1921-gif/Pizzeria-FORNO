"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useProfile } from "@/features/account/profile-context";
import { FormError } from "@/features/auth/form-parts";
import { API_URL, ApiError } from "@/lib/api";

import { errorMessage, refundAdminOrder, type AdminOrder } from "./panel-api";

/** Devolución de un pago online cobrado: total (campo vacío) o parcial, con motivo obligatorio. */
export function RefundForm({
  orderId,
  payments,
  onDone,
}: {
  orderId: string;
  payments: NonNullable<AdminOrder["payments"]>;
  onDone: () => void;
}) {
  const { token, profile } = useProfile();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const payment = payments.find(
    (item) =>
      item.method === "ONLINE" && (item.status === "PAID" || item.status === "PARTIALLY_REFUNDED"),
  );
  if (!payment || !profile?.permissions.includes("payments:refund")) return null;
  const refundable = (Number(payment.amount) - Number(payment.refundedAmount)).toFixed(2);

  async function submit() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await refundAdminOrder(token, orderId, {
        ...(amount.trim() ? { amount: amount.trim() } : {}),
        reason: reason.trim(),
      });
      setOpen(false);
      setAmount("");
      setReason("");
      onDone();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Reembolsar
      </Button>
    );
  }
  return (
    <form
      noValidate
      aria-label="Reembolsar el pago"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="border-border space-y-3 rounded-xl border p-3"
    >
      <p className="text-sm">
        Se puede devolver hasta <strong>{refundable} €</strong>. La devolución se hace en Stripe y
        no se puede deshacer.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="refund-amount" className="mb-1 block text-sm font-semibold">
            Importe (vacío = todo)
          </label>
          <input
            id="refund-amount"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder={refundable}
            className="border-border bg-background h-11 w-full rounded-lg border px-3 text-sm"
          />
        </div>
        <div>
          <label htmlFor="refund-reason" className="mb-1 block text-sm font-semibold">
            Motivo (obligatorio)
          </label>
          <input
            id="refund-reason"
            value={reason}
            maxLength={300}
            onChange={(event) => setReason(event.target.value)}
            className="border-border bg-background h-11 w-full rounded-lg border px-3 text-sm"
          />
        </div>
      </div>
      <FormError>{error}</FormError>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || reason.trim().length < 3}>
          {busy ? "Devolviendo…" : "Confirmar reembolso"}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

/** Descarga el ticket del pedido (si ya está cobrado). */
export function TicketButton({ orderId }: { orderId: string }) {
  const { token } = useProfile();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `${API_URL}/admin/orders/${encodeURIComponent(orderId)}/documents/ticket`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: { code?: string };
        } | null;
        throw new ApiError(response.status, payload?.error?.code ?? "UNKNOWN_ERROR", "failed");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `ticket-${orderId.slice(0, 8)}.pdf`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.code === "DOCUMENT_NOT_AVAILABLE"
          ? "El pedido aún no está cobrado: no hay ticket."
          : "No se ha podido descargar el ticket.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => void download()}
      >
        {busy ? "Preparando…" : "Descargar ticket (PDF)"}
      </Button>
      <FormError>{error}</FormError>
    </div>
  );
}
