import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
  auth: { onAuthStateChange: vi.fn(), signOut: vi.fn() },
}));

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: mocks.auth }) }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router, usePathname: () => "/pedido" }));

import { ProfileProvider } from "@/features/account/profile-context";
import { useCartStore } from "@/features/cart/cart-store";
import { CheckoutFlow } from "@/features/checkout/checkout-flow";
import { orderErrorMessage } from "@/features/checkout/order";
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

const settings = {
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
  enabledPaymentMethods: ["CASH_PICKUP", "CASH_DELIVERY"],
  open: true,
};

const address = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  label: "Casa",
  recipientName: "Ana",
  phone: null,
  line1: "Calle Mayor 1",
  line2: null,
  postalCode: "28001",
  city: "Madrid",
  province: null,
  notes: null,
  isDefault: true,
};

function quoteFor(type: string, delivery: object | null = null) {
  const fee = type === "DELIVERY" ? "2.50" : "0.00";
  return {
    type,
    lines: [
      {
        productId: "p1",
        productName: "Margherita",
        quantity: 2,
        notes: null,
        unitPrice: "9.50",
        lineTotal: "19.00",
        options: [{ optionId: "o-medium", group: "Tamaño", name: "Mediana", priceDelta: "0.00" }],
      },
    ],
    discounts: [],
    totals: {
      subtotal: "19.00",
      discount: "0.00",
      deliveryFee: fee,
      tax: "1.73",
      total: type === "DELIVERY" ? "21.50" : "19.00",
    },
    delivery,
    estimatedMinutes: 20,
    pointsToEarn: 19,
  };
}

const order = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  orderNumber: 7,
  status: "NEW",
  type: "PICKUP",
  scheduledFor: null,
  estimatedReadyAt: null,
  notes: null,
  createdAt: "2026-11-10T11:00:00.000Z",
  delivery: null,
  items: [],
  discounts: [],
  totals: { subtotal: "19.00", discount: "0.00", deliveryFee: "0.00", tax: "1.73", total: "19.00" },
  payments: [{ method: "CASH_PICKUP", status: "CASH_PENDING", amount: "19.00" }],
  history: [],
};

interface Scenario {
  profile?: object;
  asapAvailable?: boolean;
  delivery?: object | null;
  orderResponse?: () => Response;
  addresses?: object[];
  redemptions?: object[];
}

/** API simulada: responde a cada ruta y recuerda las peticiones de pedido. */
function mockApi(scenario: Scenario = {}) {
  const orderRequests: Array<{ body: Record<string, unknown>; key: string | null }> = [];
  const fetchMock = vi.fn(async (url: URL | string, init: RequestInit = {}) => {
    const path = new URL(String(url)).pathname.replace("/api/v1", "");
    const method = init.method ?? "GET";
    const json = (data: unknown, status = 200) => Response.json({ data }, { status });

    if (path === "/me") return json(scenario.profile ?? profile);
    if (path === "/loyalty/redemptions") {
      return Response.json({
        data: scenario.redemptions ?? [],
        meta: { page: 1, pageSize: 50, total: 0, totalPages: 1 },
      });
    }
    if (path === "/me/addresses") return json(scenario.addresses ?? [address]);
    if (path === "/delivery-zones") {
      return json([
        {
          id: "z1",
          name: "Centro",
          postalCodes: ["28001"],
          deliveryFee: "2.50",
          minimumOrder: "12.00",
          estimatedMinutes: 35,
        },
      ]);
    }
    if (path === "/store/settings") return json(settings);
    if (path === "/store/slots") {
      return json({
        type: "PICKUP",
        date: "2026-11-10",
        asapAvailable: scenario.asapAvailable ?? true,
        slotMinutes: 15,
        slots: ["2026-11-10T12:00:00.000Z", "2026-11-10T12:15:00.000Z"],
      });
    }
    if (path === "/checkout/quote") {
      const body = JSON.parse(String(init.body));
      return json(
        quoteFor(body.type, body.type === "DELIVERY" ? (scenario.delivery ?? null) : null),
      );
    }
    if (path === "/orders" && method === "POST") {
      orderRequests.push({
        body: JSON.parse(String(init.body)),
        key: new Headers(init.headers).get("Idempotency-Key"),
      });
      return scenario.orderResponse ? scenario.orderResponse() : json(order, 201);
    }
    return json([]);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { orderRequests };
}

function renderCheckout() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ProfileProvider>
      <QueryClientProvider client={client}>
        <CheckoutFlow />
      </QueryClientProvider>
    </ProfileProvider>,
  );
}

async function fillCart() {
  useCartStore.setState({
    lines: [
      {
        id: "p1|o-medium|",
        productId: "p1",
        name: "Margherita",
        imageUrl: null,
        imageAlt: "",
        optionIds: ["o-medium"],
        optionSummary: "Mediana",
        notes: null,
        quantity: 2,
      },
    ],
  });
  await useCartStore.persist.rehydrate();
}

beforeEach(async () => {
  vi.clearAllMocks();
  window.localStorage.clear();
  useCartStore.setState({ lines: [] });
  mocks.auth.onAuthStateChange.mockImplementation((callback: (e: string, s: unknown) => void) => {
    callback("INITIAL_SESSION", { access_token: "token-1" });
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CheckoutFlow", () => {
  it("tells the customer when the order is empty", async () => {
    mockApi();
    await useCartStore.persist.rehydrate();
    renderCheckout();
    expect(await screen.findByText("Tu pedido está vacío.")).toBeInTheDocument();
  });

  it("asks to complete the profile before ordering", async () => {
    mockApi({ profile: { ...profile, phone: null, profileComplete: false } });
    await fillCart();
    renderCheckout();
    expect(
      await screen.findByRole("heading", { name: "Antes de pedir, completa tus datos" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Completar mis datos" })).toHaveAttribute(
      "href",
      "/cuenta",
    );
  });

  it("places a pickup order paid in cash and goes to the confirmation page", async () => {
    const { orderRequests } = mockApi();
    await fillCart();
    const user = userEvent.setup();
    renderCheckout();

    const confirm = await screen.findByRole("button", { name: /Confirmar pedido/ });
    expect(confirm).toBeDisabled(); // falta elegir el método de pago
    await user.click(await screen.findByRole("radio", { name: "Efectivo al recoger" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Confirmar pedido · 19,00/ })).toBeEnabled(),
    );
    expect(screen.getByText("19 puntos")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Confirmar pedido/ }));

    await waitFor(() => expect(mocks.router.push).toHaveBeenCalledWith(`/pedido/${order.id}`));
    expect(orderRequests).toHaveLength(1);
    // Solo identificadores y cantidades: nada de precios.
    expect(orderRequests[0]!.body).toEqual({
      items: [{ productId: "p1", quantity: 2, optionIds: ["o-medium"] }],
      type: "PICKUP",
      paymentMethod: "CASH_PICKUP",
    });
    expect(orderRequests[0]!.key).toMatch(/^[0-9a-f-]{36}$/);
    expect(useCartStore.getState().lines).toEqual([]);
  });

  it("keeps the same idempotency key when retrying the same order after an error", async () => {
    let attempts = 0;
    const { orderRequests } = mockApi({
      orderResponse: () => {
        attempts += 1;
        return attempts === 1
          ? Response.json(
              { error: { code: "INTERNAL_ERROR", message: "x", requestId: "r" } },
              { status: 500 },
            )
          : Response.json({ data: order }, { status: 201 });
      },
    });
    await fillCart();
    const user = userEvent.setup();
    renderCheckout();

    await user.click(await screen.findByRole("radio", { name: "Efectivo al recoger" }));
    const confirm = () => screen.getByRole("button", { name: /Confirmar pedido/ });
    await waitFor(() => expect(confirm()).toBeEnabled());
    await user.click(confirm());
    expect(await screen.findByRole("alert")).toHaveTextContent(/No hemos podido enviar tu pedido/);

    await waitFor(() => expect(confirm()).toBeEnabled());
    await user.click(confirm());
    await waitFor(() => expect(mocks.router.push).toHaveBeenCalled());

    expect(orderRequests).toHaveLength(2);
    expect(orderRequests[1]!.key).toBe(orderRequests[0]!.key);
  });

  it("explains server rejections in Spanish and keeps the cart", async () => {
    mockApi({
      orderResponse: () =>
        Response.json(
          { error: { code: "STORE_CLOSED", message: "x", requestId: "r" } },
          { status: 409 },
        ),
    });
    await fillCart();
    const user = userEvent.setup();
    renderCheckout();

    await user.click(await screen.findByRole("radio", { name: "Efectivo al recoger" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Confirmar pedido/ })).toBeEnabled(),
    );
    await user.click(screen.getByRole("button", { name: /Confirmar pedido/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("El local está cerrado ahora");
    expect(useCartStore.getState().lines).toHaveLength(1);
    expect(mocks.router.push).not.toHaveBeenCalled();
  });

  it("requires choosing a time slot when the store is closed, and sends it", async () => {
    const { orderRequests } = mockApi({ asapAvailable: false });
    await fillCart();
    const user = userEvent.setup();
    renderCheckout();

    expect(
      await screen.findByText(/El local está cerrado ahora: elige una hora/),
    ).toBeInTheDocument();
    await user.click(await screen.findByRole("radio", { name: "Efectivo al recoger" }));
    expect(screen.getByRole("button", { name: /Confirmar pedido/ })).toBeDisabled();

    await user.click(await screen.findByRole("button", { name: "13:00" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Confirmar pedido/ })).toBeEnabled(),
    );
    await user.click(screen.getByRole("button", { name: /Confirmar pedido/ }));

    await waitFor(() => expect(orderRequests).toHaveLength(1));
    expect(orderRequests[0]!.body["scheduledFor"]).toBe("2026-11-10T12:00:00.000Z");
  });

  it("blocks deliveries outside the zones or below the minimum", async () => {
    mockApi({
      delivery: {
        postalCode: "28001",
        covered: false,
        zoneName: null,
        minimumOrder: null,
        belowMinimum: false,
      },
    });
    await fillCart();
    const user = userEvent.setup();
    renderCheckout();

    await user.click(await screen.findByRole("radio", { name: /Entrega a domicilio/ }));
    expect(await screen.findByText(/No repartimos en el código postal/)).toBeInTheDocument();
    await user.click(await screen.findByRole("radio", { name: "Efectivo al recibir" }));
    expect(screen.getByRole("button", { name: /Confirmar pedido/ })).toBeDisabled();
  });

  it("delivers to a covered address and sends the saved address id", async () => {
    const { orderRequests } = mockApi({
      delivery: {
        postalCode: "28001",
        covered: true,
        zoneName: "Centro",
        minimumOrder: "12.00",
        belowMinimum: false,
      },
    });
    await fillCart();
    const user = userEvent.setup();
    renderCheckout();

    await user.click(await screen.findByRole("radio", { name: /Entrega a domicilio/ }));
    expect(await screen.findByText(/Repartimos en tu zona \(Centro\)/)).toBeInTheDocument();
    await user.click(await screen.findByRole("radio", { name: "Efectivo al recibir" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Confirmar pedido · 21,50/ })).toBeEnabled(),
    );
    await user.click(screen.getByRole("button", { name: /Confirmar pedido/ }));

    await waitFor(() => expect(orderRequests).toHaveLength(1));
    expect(orderRequests[0]!.body).toMatchObject({
      type: "DELIVERY",
      addressId: address.id,
      paymentMethod: "CASH_DELIVERY",
    });
  });
});

describe("orderErrorMessage", () => {
  it("maps API codes to Spanish messages and never leaks raw server text", () => {
    const message = (code: string) => orderErrorMessage(new ApiError(422, code, "internal detail"));
    expect(message("OUTSIDE_DELIVERY_ZONE")).toMatch(/No repartimos/);
    expect(message("BELOW_MINIMUM_ORDER")).toMatch(/mínimo/);
    expect(message("INVALID_SCHEDULE")).toMatch(/hora elegida/);
    expect(message("PRODUCT_UNAVAILABLE")).toMatch(/ya no está disponible/);
    expect(message("PROFILE_INCOMPLETE")).toMatch(/Mi cuenta/);
    expect(message("SOMETHING_NEW")).not.toMatch(/internal detail/);
    expect(orderErrorMessage(new Error("boom"))).toMatch(/Inténtalo de nuevo/);
    expect(orderErrorMessage(new ApiError(0, "NETWORK_ERROR", "x"))).toMatch(/conexión/);
  });
});

describe("CheckoutFlow (delivery with a chosen time)", () => {
  it("enables the confirm button for a covered address, a time slot and cash", async () => {
    const { orderRequests } = mockApi({
      asapAvailable: false,
      delivery: {
        postalCode: "28001",
        covered: true,
        zoneName: "Centro",
        minimumOrder: "12.00",
        belowMinimum: false,
      },
    });
    await fillCart();
    const user = userEvent.setup();
    renderCheckout();

    await user.click(await screen.findByRole("radio", { name: /Entrega a domicilio/ }));
    await user.click(await screen.findByRole("button", { name: "13:00" }));
    await user.click(await screen.findByRole("radio", { name: "Efectivo al recibir" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Confirmar pedido/ })).toBeEnabled(),
    );
    await user.click(screen.getByRole("button", { name: /Confirmar pedido/ }));
    await waitFor(() => expect(orderRequests).toHaveLength(1));
    expect(orderRequests[0]!.body).toMatchObject({
      type: "DELIVERY",
      scheduledFor: "2026-11-10T12:00:00.000Z",
    });
  });
});

describe("CheckoutFlow (explaining what is missing)", () => {
  it("prefers an address with delivery over a default address without it", async () => {
    const outside = {
      ...address,
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      postalCode: "28029",
      label: "Trabajo",
    };
    const inside = { ...address, isDefault: false };
    const { orderRequests } = mockApi({
      addresses: [{ ...outside, isDefault: true }, inside],
      delivery: {
        postalCode: "28001",
        covered: true,
        zoneName: "Centro",
        minimumOrder: "12.00",
        belowMinimum: false,
      },
    });
    await fillCart();
    const user = userEvent.setup();
    renderCheckout();

    await user.click(await screen.findByRole("radio", { name: /Entrega a domicilio/ }));
    expect(await screen.findByText("Sin reparto en esta zona")).toBeInTheDocument();
    await user.click(await screen.findByRole("radio", { name: "Efectivo al recibir" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Confirmar pedido/ })).toBeEnabled(),
    );
    await user.click(screen.getByRole("button", { name: /Confirmar pedido/ }));
    await waitFor(() => expect(orderRequests).toHaveLength(1));
    expect(orderRequests[0]!.body["addressId"]).toBe(inside.id);
  });

  it("lists exactly what is missing while the button is disabled", async () => {
    mockApi({
      delivery: {
        postalCode: "28001",
        covered: true,
        zoneName: "Centro",
        minimumOrder: "25.00",
        belowMinimum: true,
      },
    });
    await fillCart();
    const user = userEvent.setup();
    renderCheckout();

    await user.click(await screen.findByRole("radio", { name: /Entrega a domicilio/ }));
    const missing = await screen.findByRole("list", { name: "Qué falta para confirmar" });
    await waitFor(() => expect(missing).toHaveTextContent(/pedido mínimo de tu zona es 25,00/));
    expect(missing).toHaveTextContent("Elige un método de pago.");
    expect(screen.getByRole("button", { name: /Confirmar pedido/ })).toBeDisabled();
  });
});
