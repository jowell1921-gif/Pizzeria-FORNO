"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { buttonVariants, Button } from "@/components/ui/button";
import { fetchAddresses } from "@/features/account/addresses";
import { fetchAvailableRedemptions } from "@/features/account/loyalty";
import { clearPromoCode, useSavedPromoCode } from "@/features/account/promo-code-store";
import { useProfile } from "@/features/account/profile-context";
import { useApiResource } from "@/features/account/use-api-resource";
import { CartLines } from "@/features/cart/cart-lines";
import { toApiItems, useCartHydrated, useCartStore } from "@/features/cart/cart-store";
import { CartTotals } from "@/features/cart/cart-totals";
import { fetchDeliveryZones, fetchSlots, fetchStoreSettings } from "@/features/catalog/api";
import { FormError } from "@/features/auth/form-parts";
import { formatEuro } from "@/lib/format";
import { fromCents, toCents } from "@/lib/money";
import { cn } from "@/lib/utils";

import { DeliverySection } from "./delivery-section";
import { discountErrorMessage, isCouponError } from "./discount-errors";
import { DemoPaymentDialog } from "./demo-payment-dialog";
import { DiscountsSection } from "./discounts-section";
import { useCheckoutQuote } from "./use-checkout-quote";
import {
  createOrder,
  orderErrorMessage,
  PAYMENT_LABELS,
  startPayment,
  type CreateOrderBody,
  type PaymentMethod,
} from "./order";
import { ScheduleSection, type ScheduleValue } from "./schedule-section";

type OrderType = "PICKUP" | "DELIVERY";

function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={`step-${number}`}
      className="border-border bg-card space-y-4 rounded-2xl border p-5 shadow-sm sm:p-6"
    >
      <h2 id={`step-${number}`} className="flex items-center gap-3 text-2xl leading-none font-bold">
        <span
          aria-hidden
          className="bg-charcoal text-cream flex size-8 shrink-0 items-center justify-center rounded-full text-base"
        >
          {number}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

const PAYMENT_BY_TYPE: Record<OrderType, PaymentMethod> = {
  PICKUP: "CASH_PICKUP",
  DELIVERY: "CASH_DELIVERY",
};

/**
 * Pedido en una sola página: modalidad, dirección, hora, pago y resumen. Los importes que se
 * muestran son los que calcula el servidor; al confirmar se vuelven a calcular. Cada intento de
 * confirmar usa una clave de idempotencia: un doble clic o un reintento no duplica el pedido.
 */
export function CheckoutFlow() {
  const router = useRouter();
  const { token, profile, profileStatus } = useProfile();
  const hydrated = useCartHydrated();
  const lines = useCartStore((state) => state.lines);
  const clear = useCartStore((state) => state.clear);

  const settings = useQuery({ queryKey: ["store-settings"], queryFn: fetchStoreSettings });
  const addresses = useApiResource(token, fetchAddresses);

  const [chosenType, setChosenType] = useState<OrderType | null>(null);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<ScheduleValue>({ mode: "asap", date: null, slot: null });
  const [payment, setPayment] = useState<PaymentMethod | null>(null);
  // Cupón: hasta que el cliente elige otro (o lo quita), se usa el código guardado en «Mi cuenta».
  const savedCoupon = useSavedPromoCode();
  const [chosenCoupon, setChosenCoupon] = useState<string | null | undefined>(undefined);
  const coupon = chosenCoupon === undefined ? savedCoupon : chosenCoupon;
  const [redemptionId, setRedemptionId] = useState<string | null>(null);
  const redemptions = useApiResource(token, fetchAvailableRedemptions);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Pedido ya creado que espera a que el cliente acepte el aviso de pago de demostración.
  const [demoPayment, setDemoPayment] = useState<{ url: string; orderId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<{ signature: string; key: string } | null>(null);

  const type: OrderType =
    chosenType ?? (settings.data && !settings.data.pickupEnabled ? "DELIVERY" : "PICKUP");
  const list = addresses.data ?? [];
  const zones = useQuery({ queryKey: ["delivery-zones"], queryFn: fetchDeliveryZones });
  /** Mientras no se conozcan las zonas se asume que hay reparto (el servidor lo comprueba igualmente). */
  const hasDelivery = (postalCode: string) =>
    zones.data ? zones.data.some((zone) => zone.postalCodes.includes(postalCode)) : true;
  // Dirección elegida; si no hay, la predeterminada (o la primera) con reparto.
  const selectedAddress =
    type === "DELIVERY"
      ? (list.find((item) => item.id === addressId) ??
        [list.find((item) => item.isDefault), ...list].find(
          (item) => item !== undefined && hasDelivery(item.postalCode),
        ) ??
        list.find((item) => item.isDefault) ??
        list[0] ??
        null)
      : null;
  const quote = useCheckoutQuote({
    type,
    postalCode: selectedAddress?.postalCode ?? null,
    token,
    couponCode: coupon,
    redemptionId,
  });
  const couponError = isCouponError(quote.discountError) ? quote.discountError : null;
  const rewardError = quote.discountError && !couponError ? quote.discountError : null;
  // Misma consulta que el selector de hora (se comparte la caché): ¿se puede pedir «lo antes posible»?
  const asapSlots = useQuery({
    queryKey: ["slots", type, "today"],
    queryFn: () => fetchSlots(type),
  });

  // El pedido ya está creado y el carrito vacío: el aviso debe seguir visible aunque la pantalla cambie.
  const demoDialog = (
    <DemoPaymentDialog
      open={demoPayment !== null}
      onContinue={() => demoPayment && window.location.assign(demoPayment.url)}
      onCancel={() => demoPayment && router.push(`/pedido/${demoPayment.orderId}`)}
    />
  );

  if (!hydrated || profileStatus === "loading" || profileStatus === "idle" || settings.isLoading) {
    return <p className="text-muted-foreground">Preparando tu pedido…</p>;
  }
  if (settings.isError || !settings.data) {
    return <FormError>No hemos podido cargar los datos del local. Recarga la página.</FormError>;
  }
  if (lines.length === 0) {
    if (demoPayment) return demoDialog;
    return (
      <div className="space-y-4">
        <p>Tu pedido está vacío.</p>
        <Link href="/carta" className={buttonVariants({ size: "lg" })}>
          Ver la carta
        </Link>
      </div>
    );
  }
  if (!profile || !token) {
    return <FormError>No hemos podido cargar tu perfil. Recarga la página.</FormError>;
  }
  if (!profile.profileComplete) {
    return (
      <div className="border-border bg-cream-soft space-y-4 rounded-2xl border p-6">
        <h2 className="text-2xl font-bold">Antes de pedir, completa tus datos</h2>
        <p className="text-sm">
          Necesitamos tu nombre de usuario y un teléfono para avisarte de tu pedido.
        </p>
        <Link href="/cuenta" className={buttonVariants({ size: "lg" })}>
          Completar mis datos
        </Link>
      </div>
    );
  }

  const store = settings.data;
  const typeEnabled = { PICKUP: store.pickupEnabled, DELIVERY: store.deliveryEnabled };
  // Métodos posibles para esta modalidad: pago online (si la pasarela está activa) o efectivo.
  const paymentOptions = (["ONLINE", PAYMENT_BY_TYPE[type]] as const).filter((method) =>
    store.enabledPaymentMethods.includes(method),
  );
  const selectedPayment = payment !== null && paymentOptions.includes(payment) ? payment : null;

  const delivery = quote.data?.delivery;
  const deliveryOk =
    type === "PICKUP" ||
    (selectedAddress !== null && delivery?.covered === true && !delivery.belowMinimum);
  const asap = asapSlots.data?.asapAvailable;
  // Con el local cerrado no hay «lo antes posible»: hay que elegir una hora.
  const slotMode = asap === false || schedule.mode === "slot";
  const scheduleOk = slotMode ? schedule.slot !== null : asap === true;
  const canSubmit =
    !store.ordersPaused &&
    typeEnabled[type] &&
    deliveryOk &&
    scheduleOk &&
    selectedPayment !== null &&
    quote.data !== undefined &&
    !quote.discountError &&
    !submitting;

  /** Lo que falta para poder confirmar, en palabras del cliente. */
  const missing: string[] = [];
  if (store.ordersPaused) missing.push("Ahora mismo no estamos aceptando pedidos.");
  if (!typeEnabled[type]) missing.push("Esta modalidad no está disponible ahora mismo.");
  if (type === "DELIVERY") {
    if (!selectedAddress) missing.push("Elige o añade una dirección de entrega.");
    else if (delivery && !delivery.covered) {
      missing.push(
        "La dirección elegida está fuera de la zona de reparto: elige otra o recoge en el local.",
      );
    } else if (delivery?.belowMinimum && delivery.minimumOrder && quote.data) {
      const short =
        toCents(delivery.minimumOrder) -
        toCents(quote.data.totals.subtotal) +
        toCents(quote.data.totals.discount);
      missing.push(
        `Añade ${formatEuro(fromCents(short))} más en productos: el pedido mínimo de tu zona es ${formatEuro(delivery.minimumOrder)}.`,
      );
    }
  }
  if (quote.discountError) {
    missing.push("Corrige o quita el código o la recompensa que no se puede aplicar.");
  }
  if (!scheduleOk) missing.push("Elige la hora de tu pedido.");
  if (selectedPayment === null) missing.push("Elige un método de pago.");
  if (quote.data === undefined && !quote.isError) missing.push("Calculando el importe…");

  async function submit() {
    if (!canSubmit || !selectedPayment || !token) return;
    setSubmitting(true);
    setError(null);

    const body: CreateOrderBody = {
      items: toApiItems(lines),
      type,
      paymentMethod: selectedPayment,
      ...(type === "DELIVERY" && selectedAddress ? { addressId: selectedAddress.id } : {}),
      ...(slotMode && schedule.slot ? { scheduledFor: schedule.slot } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      ...(coupon ? { couponCode: coupon } : {}),
      ...(redemptionId ? { redemptionId } : {}),
    };
    // Misma petición => misma clave (reintento seguro); si cambia algo, clave nueva.
    const signature = JSON.stringify(body);
    if (attempt.current?.signature !== signature) {
      attempt.current = { signature, key: crypto.randomUUID() };
    }

    try {
      const order = await createOrder(token, body, attempt.current.key);
      clear();
      if (selectedPayment === "ONLINE") {
        // Pago con tarjeta: se sigue en la página segura de la pasarela. El pedido no se confirma hasta
        // que ella lo comunica; si algo falla aquí, el cliente puede reintentar desde su pedido.
        try {
          const session = await startPayment(token, order.id);
          setDemoPayment({ url: session.url, orderId: order.id });
          return;
        } catch {
          // Se sigue a la página del pedido, que ofrece «Pagar ahora».
        }
      }
      router.push(`/pedido/${order.id}`);
    } catch (caught) {
      setError(orderErrorMessage(caught));
      setSubmitting(false);
    }
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      {demoDialog}
      <div className="space-y-6">
        {store.ordersPaused ? (
          <FormError>
            {store.pausedMessage ?? "Ahora mismo no estamos aceptando pedidos."}
          </FormError>
        ) : null}

        <Step number={1} title="¿Cómo lo quieres?">
          <div role="radiogroup" aria-label="Modalidad" className="grid gap-2 sm:grid-cols-2">
            {(["PICKUP", "DELIVERY"] as const).map((option) => (
              <label
                key={option}
                className={cn(
                  "border-border flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm",
                  type === option && "border-tomato-strong bg-cream-soft",
                  !typeEnabled[option] && "cursor-not-allowed opacity-50",
                )}
              >
                <input
                  type="radio"
                  name="type"
                  checked={type === option}
                  disabled={!typeEnabled[option]}
                  onChange={() => {
                    setChosenType(option);
                    setSchedule({ mode: "asap", date: null, slot: null });
                  }}
                  className="accent-tomato-strong mt-0.5 size-5"
                />
                <span>
                  <span className="font-semibold">
                    {option === "PICKUP" ? "Recoger en el local" : "Entrega a domicilio"}
                  </span>
                  <span className="text-muted-foreground block">
                    {option === "PICKUP"
                      ? `Listo en unos ${store.prepTimeMinutes} minutos`
                      : `Unos ${store.deliveryTimeMinutes} minutos`}
                  </span>
                </span>
              </label>
            ))}
          </div>

          {type === "DELIVERY" ? (
            addresses.status === "error" ? (
              <FormError>No hemos podido cargar tus direcciones.</FormError>
            ) : addresses.status !== "ready" ? (
              <p className="text-muted-foreground text-sm">Cargando tus direcciones…</p>
            ) : (
              <DeliverySection
                addresses={list}
                reload={addresses.reload}
                effectiveId={selectedAddress?.id ?? null}
                onSelect={setAddressId}
                hasDelivery={hasDelivery}
                quote={quote.data}
              />
            )
          ) : null}
        </Step>

        <Step number={2} title={type === "PICKUP" ? "¿Cuándo lo recoges?" : "¿Cuándo lo recibes?"}>
          <ScheduleSection type={type} settings={store} value={schedule} onChange={setSchedule} />
        </Step>

        <Step number={3} title="Descuentos">
          <DiscountsSection
            coupon={coupon}
            onApplyCoupon={(code) => setChosenCoupon(code)}
            onRemoveCoupon={() => {
              setChosenCoupon(null);
              clearPromoCode();
            }}
            couponError={couponError ? discountErrorMessage(couponError) : null}
            couponPending={quote.discountPending}
            redemptions={redemptions.data ?? []}
            redemptionId={redemptionId}
            onSelectRedemption={setRedemptionId}
            rewardError={rewardError ? discountErrorMessage(rewardError) : null}
          />
        </Step>

        <Step number={4} title="Pago">
          {paymentOptions.length > 0 ? (
            <div role="radiogroup" aria-label="Método de pago" className="grid gap-2">
              {paymentOptions.map((method) => (
                <label
                  key={method}
                  className={cn(
                    "border-border flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm",
                    selectedPayment === method && "border-tomato-strong bg-cream-soft",
                  )}
                >
                  <input
                    type="radio"
                    name="payment"
                    checked={selectedPayment === method}
                    onChange={() => setPayment(method)}
                    className="accent-tomato-strong size-5"
                  />
                  <span className="font-semibold">{PAYMENT_LABELS[method]}</span>
                </label>
              ))}
            </div>
          ) : (
            <p role="alert" className="text-destructive text-sm font-medium">
              No hay ningún método de pago disponible para esta modalidad.
            </p>
          )}
          <p className="text-muted-foreground text-sm">
            {selectedPayment === "ONLINE"
              ? "Al confirmar te llevaremos a la página segura de Stripe para pagar con tarjeta. Tu pedido se confirma cuando comprobamos el pago."
              : paymentOptions.includes("ONLINE")
                ? "Con el efectivo, pagas cuando recibes o recoges el pedido."
                : "El pago online no está disponible ahora mismo: el pedido se paga en efectivo."}
          </p>
        </Step>

        <Step number={5} title="Observaciones">
          <label htmlFor="order-notes" className="text-sm font-semibold">
            ¿Algo que debamos saber?{" "}
            <span className="text-muted-foreground font-normal">(opcional)</span>
          </label>
          <textarea
            id="order-notes"
            maxLength={300}
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="border-border bg-background w-full rounded-lg border p-3 text-sm"
          />
        </Step>
      </div>

      <aside aria-label="Resumen del pedido" className="space-y-4 lg:sticky lg:top-32">
        <div className="border-border bg-card space-y-4 rounded-2xl border p-5 shadow-sm sm:p-6">
          <h2 className="text-2xl leading-none font-bold">Tu pedido</h2>
          <CartLines quote={quote.data} readOnly />
          {quote.isError ? (
            <p role="alert" className="text-destructive text-sm font-medium">
              No hemos podido calcular el importe. Algún producto puede haber cambiado: revisa tu
              pedido.
            </p>
          ) : quote.data ? (
            <>
              <CartTotals quote={quote.data} />
              {quote.data.pointsToEarn > 0 ? (
                <p className="bg-cream-soft rounded-lg p-3 text-sm">
                  Con este pedido sumarás unos <strong>{quote.data.pointsToEarn} puntos</strong> de
                  FORNEA CLUB cuando se complete.
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-muted-foreground text-sm">Calculando importe…</p>
          )}

          <FormError>{error}</FormError>
          {!canSubmit && !submitting && missing.length > 0 ? (
            <ul
              aria-label="Qué falta para confirmar"
              className="bg-cream-soft list-disc space-y-1 rounded-lg p-3 pl-7 text-sm"
            >
              {missing.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : null}
          <Button
            type="button"
            size="lg"
            disabled={!canSubmit}
            onClick={submit}
            className="w-full tracking-wide uppercase"
          >
            {submitting
              ? "Enviando pedido…"
              : quote.data
                ? `${selectedPayment === "ONLINE" ? "Pagar y confirmar" : "Confirmar pedido"} · ${formatEuro(quote.data.totals.total)}`
                : "Confirmar pedido"}
          </Button>
          <p className="text-muted-foreground text-center text-xs">
            Al confirmar aceptas las{" "}
            <Link href="/legal/condiciones-de-compra" className="underline underline-offset-4">
              condiciones de compra
            </Link>
            .
          </p>
        </div>
        <Link href="/carta" className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
          Seguir añadiendo productos
        </Link>
      </aside>
    </div>
  );
}
