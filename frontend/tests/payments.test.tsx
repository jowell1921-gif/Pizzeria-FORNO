import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
  auth: { onAuthStateChange: vi.fn(), signOut: vi.fn() },
}));

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: mocks.auth }) }));
vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
  usePathname: () => "/pedido",
}));

import { ProfileProvider } from "@/features/account/profile-context";
import { useCartStore } from "@/features/cart/cart-store";
import { CheckoutFlow } from "@/features/checkout/checkout-flow";
import { orderErrorMessage } from "@/features/checkout/order";
import { OrderView } from "@/features/checkout/order-view";
import { ApiError } from "@/lib/api";

const profile = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "ana@example.com",
  fullName: "Ana López",
  username: "ana_l",
  phone: "+34 600 000 000",
  profileComplete: true,
  marketingConsent: false,
  roles: [],
  permissions: [],
  createdAt: "2026-11-07T10:00:00.000Z",
};

const settings = (methods: string[]) => ({
  name: "FORNEA",
  timezone: "Europe/Madrid",
  slotMinutes: 15,
  maxAdvanceDays: 2,
  prepTimeMinutes: 20,
  deliveryTimeMinutes: 40,
  pickupEnabled: true,
  deliveryEnabled: true,
  ordersPaused: false,
  pausedMessage: null,
  enabledPaymentMethods: methods,
  open: true,
});

const quote = {
  type: "PICKUP",
  lines: [
    {
      productId: "p1",
      productName: "Margherita",
      quantity: 2,
      notes: null,
      unitPrice: "9.50",
      lineTotal: "19.00",
      options: [],
    },
  ],
  discounts: [],
  totals: { subtotal: "19.00", discount: "0.00", deliveryFee: "0.00", tax: "1.73", total: "19.00" },
  delivery: null,
  estimatedMinutes: 20,
  pointsToEarn: 19,
};

const ORDER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const orderBase = {
  id: ORDER_ID,
  orderNumber: 7,
  status: "PENDING_PAYMENT",
  type: "PICKUP",
  scheduledFor: null,
  estimatedReadyAt: null,
  notes: null,
  createdAt: "2026-11-10T11:00:00.000Z",
  delivery: null,
  items: [],
  discounts: [],
  totals: quote.totals,
  payments: [{ method: "ONLINE", status: "PENDING", amount: "19.00" }],
  history: [],
};

interface Scenario {
  methods?: string[];
  order?: () => object;
  session?: () => Response;
  documents?: object;
}

function mockApi(scenario: Scenario = {}) {
  const calls: Array<{ key: string; body?: Record<string, unknown> }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL | string, init: RequestInit = {}) => {
      const path = new URL(String(url)).pathname.replace("/api/v1", "");
      const method = init.method ?? "GET";
      const key = `${method} ${path}`;
      calls.push({
        key,
        ...(typeof init.body === "string" ? { body: JSON.parse(init.body) } : {}),
      });
      const json = (data: unknown, status = 200) => Response.json({ data }, { status });
      if (path === "/me") return json(profile);
      if (path === "/store/settings")
        return json(settings(scenario.methods ?? ["ONLINE", "CASH_PICKUP"]));
      if (path === "/store/slots") {
        return json({
          type: "PICKUP",
          date: "2026-11-10",
          asapAvailable: true,
          slotMinutes: 15,
          slots: [],
        });
      }
      if (path === "/checkout/quote") return json(quote);
      if (path === "/orders" && method === "POST") return json(orderBase, 201);
      if (path === `/orders/${ORDER_ID}/payment-session`) {
        return scenario.session?.() ?? json({ url: "https://checkout.stripe.com/c/pay/cs_test_1" });
      }
      if (path === `/orders/${ORDER_ID}/documents`) {
        return json(scenario.documents ?? { settled: false, documents: [] });
      }
      if (path === `/orders/${ORDER_ID}`) return json(scenario.order?.() ?? orderBase);
      if (path === "/loyalty/redemptions") {
        return Response.json({
          data: [],
          meta: { page: 1, pageSize: 50, total: 0, totalPages: 1 },
        });
      }
      return json([]);
    }),
  );
  return calls;
}

function wrap(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ProfileProvider>
      <QueryClientProvider client={client}>{node}</QueryClientProvider>
    </ProfileProvider>,
  );
}

async function fillCart() {
  useCartStore.setState({
    lines: [
      {
        id: "p1||",
        productId: "p1",
        name: "Margherita",
        imageUrl: null,
        imageAlt: "",
        optionIds: [],
        optionSummary: "",
        notes: null,
        quantity: 2,
      },
    ],
  });
  await useCartStore.persist.rehydrate();
}

const assign = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  useCartStore.setState({ lines: [] });
  window.history.replaceState(null, "", "/");
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, assign, search: "" },
  });
  mocks.auth.onAuthStateChange.mockImplementation((callback: (e: string, s: unknown) => void) => {
    callback("INITIAL_SESSION", { access_token: "token-1" });
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("checkout with online payment", () => {
  it("offers card and cash when the gateway is active, and only cash when it is not", async () => {
    mockApi();
    await fillCart();
    const first = wrap(<CheckoutFlow />);
    expect(
      await screen.findByRole("radio", { name: "Pago online con tarjeta" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Efectivo al recoger" })).toBeInTheDocument();
    first.unmount();

    mockApi({ methods: ["CASH_PICKUP"] });
    wrap(<CheckoutFlow />);
    expect(await screen.findByRole("radio", { name: "Efectivo al recoger" })).toBeInTheDocument();
    expect(
      screen.queryByRole("radio", { name: "Pago online con tarjeta" }),
    ).not.toBeInTheDocument();
  });

  it("creates the order, asks for the payment session and sends the customer to the payment page", async () => {
    const calls = mockApi();
    await fillCart();
    const user = userEvent.setup();
    wrap(<CheckoutFlow />);

    await user.click(await screen.findByRole("radio", { name: "Pago online con tarjeta" }));
    expect(screen.getByText(/página segura de Stripe/)).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: /Pagar y confirmar · 19,00/ }));

    const dialog = await screen.findByRole("dialog", { name: "Pago de demostración" });
    expect(within(dialog).getByText("4242 4242 4242 4242")).toBeInTheDocument();
    expect(within(dialog).getByText(/únicamente demostrativo/)).toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Continuar al pago" }));
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/cs_test_1"),
    );
    expect(calls.find((call) => call.key === "POST /orders")?.body).toMatchObject({
      paymentMethod: "ONLINE",
    });
    expect(calls.map((call) => call.key)).toContain(`POST /orders/${ORDER_ID}/payment-session`);
    expect(mocks.router.push).not.toHaveBeenCalled();
  });

  it("falls back to the order page («Pagar ahora») when the payment page cannot be opened", async () => {
    mockApi({
      session: () =>
        Response.json({ error: { code: "PAYMENT_PROVIDER_ERROR", message: "x" } }, { status: 502 }),
    });
    await fillCart();
    const user = userEvent.setup();
    wrap(<CheckoutFlow />);
    await user.click(await screen.findByRole("radio", { name: "Pago online con tarjeta" }));
    await user.click(await screen.findByRole("button", { name: /Pagar y confirmar/ }));
    await waitFor(() => expect(mocks.router.push).toHaveBeenCalledWith(`/pedido/${ORDER_ID}`));
    expect(assign).not.toHaveBeenCalled();
  });
});

describe("order page awaiting payment", () => {
  it("offers to pay again and never says the order is paid", async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    wrap(<OrderView orderId={ORDER_ID} />);

    const section = await screen.findByRole("region", { name: "Pago pendiente" });
    expect(
      within(section).getByText(/se cancela solo si no se paga en media hora/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Pago recibido/)).not.toBeInTheDocument();

    await user.click(within(section).getByRole("button", { name: "Pagar ahora con tarjeta" }));
    const dialog = await screen.findByRole("dialog", { name: "Pago de demostración" });
    expect(assign).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Continuar al pago" }));
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/cs_test_1"),
    );
    expect(calls.map((call) => call.key)).toContain(`POST /orders/${ORDER_ID}/payment-session`);
  });

  it("does not open the payment page when the customer dismisses the demo notice", async () => {
    mockApi();
    const user = userEvent.setup();
    wrap(<OrderView orderId={ORDER_ID} />);

    const section = await screen.findByRole("region", { name: "Pago pendiente" });
    await user.click(within(section).getByRole("button", { name: "Pagar ahora con tarjeta" }));
    const dialog = await screen.findByRole("dialog", { name: "Pago de demostración" });
    await user.click(within(dialog).getByRole("button", { name: "Ahora no" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Pago de demostración" }),
      ).not.toBeInTheDocument(),
    );
    expect(assign).not.toHaveBeenCalled();
    expect(within(section).getByRole("button", { name: "Pagar ahora con tarjeta" })).toBeEnabled();
  });

  it("after returning from the payment page it waits for the server and does not trust the URL", async () => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign, search: "?pago=ok" },
    });
    let paid = false;
    const calls = mockApi({
      order: () =>
        paid
          ? {
              ...orderBase,
              status: "NEW",
              payments: [{ method: "ONLINE", status: "PAID", amount: "19.00" }],
            }
          : orderBase,
      documents: { settled: false, documents: [] },
    });
    wrap(<OrderView orderId={ORDER_ID} />);

    expect(await screen.findByText(/Estamos confirmando tu pago/)).toBeInTheDocument();
    expect(screen.queryByText(/Pago recibido/)).not.toBeInTheDocument();

    paid = true; // el servidor recibe el evento verificado de Stripe
    expect(await screen.findByText(/Pago recibido/, {}, { timeout: 6000 })).toBeInTheDocument();
    expect(screen.queryByText(/Estamos confirmando tu pago/)).not.toBeInTheDocument();
    expect(calls.filter((call) => call.key === `GET /orders/${ORDER_ID}`).length).toBeGreaterThan(
      1,
    );
  }, 12_000);

  it("says so when the customer left the payment page without paying", async () => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign, search: "?pago=cancelado" },
    });
    mockApi();
    wrap(<OrderView orderId={ORDER_ID} />);
    expect(await screen.findByText(/sin completarla/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pagar ahora con tarjeta" })).toBeEnabled();
  });
});

describe("tickets and invoices on the order page", () => {
  const paidOrder = () => ({
    ...orderBase,
    status: "COMPLETED",
    payments: [{ method: "ONLINE", status: "PAID", amount: "19.00" }],
  });

  it("are not shown until the order is paid", async () => {
    mockApi({ order: () => orderBase });
    wrap(<OrderView orderId={ORDER_ID} />);
    await screen.findByRole("region", { name: "Pago pendiente" });
    expect(screen.queryByRole("heading", { name: "Ticket y factura" })).not.toBeInTheDocument();
  });

  it("let the customer request an invoice with their tax data", async () => {
    const calls = mockApi({
      order: paidOrder,
      documents: { settled: true, documents: [] },
    });
    const user = userEvent.setup();
    wrap(<OrderView orderId={ORDER_ID} />);

    expect(
      await screen.findByRole("button", { name: "Descargar ticket (PDF)" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Solicitar factura" }));
    const form = await screen.findByRole("form", { name: "Datos para la factura" });
    const submit = within(form).getByRole("button", { name: "Emitir factura" });
    expect(submit).toBeDisabled();
    await user.type(within(form).getByLabelText("Nombre o razón social"), "Panadería Ejemplo S.L.");
    await user.type(within(form).getByLabelText("NIF / CIF"), "B12345678");
    await user.type(within(form).getByLabelText("Dirección fiscal"), "Calle Falsa 123, Madrid");
    await user.click(submit);

    await waitFor(() =>
      expect(calls.map((call) => call.key)).toContain(`POST /orders/${ORDER_ID}/invoice`),
    );
    expect(calls.find((call) => call.key === `POST /orders/${ORDER_ID}/invoice`)?.body).toEqual({
      name: "Panadería Ejemplo S.L.",
      taxId: "B12345678",
      address: "Calle Falsa 123, Madrid",
    });
  });

  it("show the invoice already issued", async () => {
    mockApi({
      order: paidOrder,
      documents: {
        settled: true,
        documents: [
          {
            type: "INVOICE",
            number: "F-2026-000001",
            issuedAt: "2026-11-10T12:00:00.000Z",
            total: "19.00",
          },
        ],
      },
    });
    wrap(<OrderView orderId={ORDER_ID} />);
    expect(
      await screen.findByRole("button", { name: "Descargar factura F-2026-000001" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Solicitar factura" })).not.toBeInTheDocument();
  });
});

describe("error messages", () => {
  it("explain payment problems in Spanish", () => {
    const message = (code: string) => orderErrorMessage(new ApiError(409, code, "internal"));
    expect(message("PAYMENTS_NOT_CONFIGURED")).toMatch(/pago online no está disponible/);
    expect(message("ORDER_NOT_PAYABLE")).toMatch(/ya no está pendiente de pago/);
    expect(message("PAYMENT_IN_PROGRESS")).toMatch(/confirmando tu pago/);
    expect(message("PAYMENT_PROVIDER_ERROR")).toMatch(/pasarela de pago/);
    expect(message("DOCUMENT_NOT_AVAILABLE")).toMatch(/aún no está cobrado/);
    expect(message("PAYMENT_PROVIDER_ERROR")).not.toMatch(/internal/);
  });
});
