import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
  auth: { onAuthStateChange: vi.fn(), signOut: vi.fn() },
}));

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: mocks.auth }) }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router, usePathname: () => "/" }));

import { benefitText } from "@/features/account/loyalty";
import { PointsCard } from "@/features/account/points-card";
import { ProfileProvider } from "@/features/account/profile-context";
import { clearPromoCode, savePromoCode } from "@/features/account/promo-code-store";
import { RedemptionsCard } from "@/features/account/redemptions-card";
import { useCartStore } from "@/features/cart/cart-store";
import { CheckoutFlow } from "@/features/checkout/checkout-flow";
import { discountErrorMessage } from "@/features/checkout/discount-errors";
import { OrderView } from "@/features/checkout/order-view";
import { pointsRuleText } from "@/features/club/format";
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

const water = {
  type: "FREE_PRODUCT" as const,
  productId: "p",
  productName: "Agua mineral",
  amount: null,
};
const rewards = [
  {
    id: "r1",
    name: "Bebida gratis",
    description: null,
    pointsCost: 100,
    benefit: water,
    inStock: true,
  },
  { id: "r2", name: "Entrante", description: null, pointsCost: 250, benefit: water, inStock: true },
];
const account = {
  balance: 130,
  lifetimeEarned: 130,
  pointsPerEuro: "1",
  expiryDays: null,
  availableRewards: 1,
  nextReward: { id: "r2", name: "Entrante", pointsCost: 250, pointsMissing: 120, progress: 0.2 },
};
const redemption = {
  id: "d1",
  rewardId: "r1",
  rewardName: "Bebida gratis",
  pointsSpent: 100,
  status: "AVAILABLE",
  benefit: water,
  orderNumber: null,
  createdAt: "2026-11-08T10:00:00.000Z",
  usedAt: null,
  expiresAt: null,
};

const page = (data: unknown[]) => ({
  data,
  meta: { page: 1, pageSize: 5, total: data.length, totalPages: 1 },
});

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  clearPromoCode();
  useCartStore.setState({ lines: [] });
  mocks.auth.onAuthStateChange.mockImplementation((callback: (e: string, s: unknown) => void) => {
    callback("INITIAL_SESSION", { access_token: "token-1" });
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("helpers", () => {
  it("describes the points rule and the benefit of a reward", () => {
    expect(pointsRuleText("1")).toBe("1 punto por cada euro");
    expect(pointsRuleText("0.5")).toBe("0,5 puntos por cada euro");
    expect(pointsRuleText(null)).toMatch(/puntos por cada euro/);
    expect(benefitText(water)).toBe("Producto gratis: Agua mineral");
    expect(
      benefitText({ type: "DISCOUNT", productId: null, productName: null, amount: "5.00" }),
    ).toBe("Descuento de 5.00 €");
    expect(benefitText(null)).toBe("");
  });

  it("explains each coupon error in Spanish", () => {
    const message = (code: string, details?: unknown) =>
      discountErrorMessage(new ApiError(422, code, "Add x", details));
    expect(message("COUPON_NOT_FOUND")).toMatch(/no existe/);
    expect(message("COUPON_EXPIRED")).toMatch(/caducado/);
    expect(message("COUPON_NOT_FIRST_ORDER")).toMatch(/primer pedido/);
    expect(message("COUPON_ALREADY_USED")).toMatch(/Ya has usado/);
    expect(message("COUPON_MIN_SUBTOTAL", { minSubtotal: "50.00" })).toMatch(/50,00/);
    expect(message("REDEMPTION_NOT_AVAILABLE")).toMatch(/recompensa/);
    expect(message("REWARD_NOT_APPLICABLE")).toMatch(/Añade el producto/);
    expect(message("ALGO_NUEVO")).not.toMatch(/ALGO_NUEVO/);
  });
});

function mockPoints(options: { redeem?: () => Response } = {}) {
  const posts: Array<{ body: unknown; key: string | null }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL | string, init: RequestInit = {}) => {
      const path = new URL(String(url)).pathname.replace("/api/v1", "");
      const method = init.method ?? "GET";
      const json = (data: unknown, status = 200) => Response.json({ data }, { status });
      if (path === "/me") return json(profile);
      if (path === "/loyalty/account") return json(account);
      if (path === "/loyalty/rewards") return json(rewards);
      if (path === "/loyalty/transactions") return Response.json(page([]));
      if (path === "/loyalty/redemptions" && method === "POST") {
        posts.push({
          body: JSON.parse(String(init.body)),
          key: new Headers(init.headers).get("Idempotency-Key"),
        });
        return options.redeem ? options.redeem() : json(redemption, 201);
      }
      if (path === "/loyalty/redemptions") return Response.json(page([redemption]));
      return json([]);
    }),
  );
  return { posts };
}

function renderCard(node: React.ReactNode) {
  return render(<ProfileProvider>{node}</ProfileProvider>);
}

describe("PointsCard (redeeming rewards)", () => {
  it("offers to redeem only the affordable rewards, asking for confirmation", async () => {
    const { posts } = mockPoints();
    const onRedeemed = vi.fn();
    const user = userEvent.setup();
    renderCard(<PointsCard onRedeemed={onRedeemed} />);

    expect(
      await screen.findByRole("button", { name: /Canjear · 100\s*puntos: Bebida gratis/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /puntos: Entrante/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Canjear · 100\s*puntos: Bebida gratis/ }));
    expect(posts).toHaveLength(0); // aún no: pide confirmación
    await user.click(screen.getByRole("button", { name: /Confirmar \(100 puntos\)/ }));

    expect(await screen.findByText(/Has canjeado «Bebida gratis»/)).toBeInTheDocument();
    expect(posts).toHaveLength(1);
    expect(posts[0]!.body).toEqual({ rewardId: "r1" });
    expect(posts[0]!.key).toMatch(/^[0-9a-f-]{36}$/);
    expect(onRedeemed).toHaveBeenCalled();
  });

  it("explains when there are not enough points and lets the customer back out", async () => {
    mockPoints({
      redeem: () =>
        Response.json(
          { error: { code: "INSUFFICIENT_POINTS", message: "x", requestId: "r" } },
          { status: 409 },
        ),
    });
    const user = userEvent.setup();
    renderCard(<PointsCard />);

    await user.click(
      await screen.findByRole("button", { name: /Canjear · 100\s*puntos: Bebida gratis/ }),
    );
    await user.click(screen.getByRole("button", { name: /Confirmar/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/No tienes puntos suficientes/);

    await user.click(screen.getByRole("button", { name: "No" }));
    expect(
      screen.getByRole("button", { name: /Canjear · 100\s*puntos: Bebida gratis/ }),
    ).toBeInTheDocument();
  });
});

describe("RedemptionsCard", () => {
  it("shows the redeemed rewards ready to use and how to use them", async () => {
    mockPoints();
    renderCard(<RedemptionsCard />);
    expect(await screen.findByText("Bebida gratis")).toBeInTheDocument();
    expect(screen.getByText("Producto gratis: Agua mineral")).toBeInTheDocument();
    expect(screen.getByText(/Elige la recompensa al finalizar tu pedido/)).toBeInTheDocument();
  });
});

const checkoutSettings = {
  name: "FORNO",
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

function quoteBody(discounts: Array<{ description: string; amount: string }>) {
  const discount = discounts.reduce((sum, item) => sum + Number(item.amount), 0);
  return {
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
    discounts,
    totals: {
      subtotal: "19.00",
      discount: discount.toFixed(2),
      deliveryFee: "0.00",
      tax: "1.55",
      total: (19 - discount).toFixed(2),
    },
    delivery: null,
    estimatedMinutes: 20,
    pointsToEarn: 17,
  };
}

const placedOrder = {
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

function mockCheckout(options: { redemptions?: object[]; couponError?: string } = {}) {
  const quoteRequests: Array<Record<string, unknown>> = [];
  const orders: Array<Record<string, unknown>> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL | string, init: RequestInit = {}) => {
      const path = new URL(String(url)).pathname.replace("/api/v1", "");
      const json = (data: unknown, status = 200) => Response.json({ data }, { status });
      if (path === "/me") return json(profile);
      if (path === "/me/addresses") return json([]);
      if (path === "/store/settings") return json(checkoutSettings);
      if (path === "/store/slots") {
        return json({
          type: "PICKUP",
          date: "2026-11-10",
          asapAvailable: true,
          slotMinutes: 15,
          slots: [],
        });
      }
      if (path === "/delivery-zones") return json([]);
      if (path === "/loyalty/redemptions") return Response.json(page(options.redemptions ?? []));
      if (path === "/checkout/quote") {
        const body = JSON.parse(String(init.body));
        quoteRequests.push({ ...body, authorized: new Headers(init.headers).has("Authorization") });
        if (body.couponCode && options.couponError) {
          return Response.json(
            { error: { code: options.couponError, message: "x", requestId: "r" } },
            { status: 422 },
          );
        }
        const discounts = [];
        if (body.couponCode)
          discounts.push({ description: `Bienvenida (${body.couponCode})`, amount: "1.90" });
        if (body.redemptionId)
          discounts.push({ description: "Recompensa: Bebida gratis", amount: "2.00" });
        return json(quoteBody(discounts));
      }
      if (path === "/orders" && init.method === "POST") {
        orders.push(JSON.parse(String(init.body)));
        return json(placedOrder, 201);
      }
      return json([]);
    }),
  );
  return { quoteRequests, orders };
}

async function renderCheckout() {
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
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ProfileProvider>
      <QueryClientProvider client={client}>
        <CheckoutFlow />
      </QueryClientProvider>
    </ProfileProvider>,
  );
}

describe("CheckoutFlow (coupon and reward)", () => {
  it("applies the coupon saved in the account automatically, shows the discount and sends the code", async () => {
    savePromoCode("BIENVENIDO10");
    const { quoteRequests, orders } = mockCheckout();
    const user = userEvent.setup();
    await renderCheckout();

    expect(await screen.findByText("Bienvenida (BIENVENIDO10)")).toBeInTheDocument();
    expect(screen.getByText("BIENVENIDO10", { selector: "code" })).toBeInTheDocument();
    // El presupuesto con cupón lleva la sesión; el básico, no.
    expect(
      quoteRequests.some(
        (request) => request["couponCode"] === "BIENVENIDO10" && request["authorized"],
      ),
    ).toBe(true);
    expect(screen.getByRole("button", { name: /Confirmar pedido · 17,10/ })).toBeInTheDocument();

    await user.click(await screen.findByRole("radio", { name: "Efectivo al recoger" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Confirmar pedido/ })).toBeEnabled(),
    );
    await user.click(screen.getByRole("button", { name: /Confirmar pedido/ }));
    await waitFor(() => expect(orders).toHaveLength(1));
    expect(orders[0]).toMatchObject({ couponCode: "BIENVENIDO10", type: "PICKUP" });
    // Nunca se envían importes: solo el código.
    expect(orders[0]).not.toHaveProperty("discount");
  });

  it("explains a rejected coupon, keeps the normal total and blocks the order until it is removed", async () => {
    mockCheckout({ couponError: "COUPON_EXPIRED" });
    const user = userEvent.setup();
    await renderCheckout();

    await user.type(await screen.findByLabelText("¿Tienes un código promocional?"), "viejo10");
    await user.click(screen.getByRole("button", { name: "Aplicar código" }));

    expect(await screen.findByText("Este código ha caducado.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Confirmar pedido · 19,00/ })).toBeDisabled();
    expect(
      screen.getByText("Corrige o quita el código o la recompensa que no se puede aplicar."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Quitar código" }));
    await user.click(await screen.findByRole("radio", { name: "Efectivo al recoger" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Confirmar pedido/ })).toBeEnabled(),
    );
  });

  it("uses a reward from the wallet and sends its id", async () => {
    const { orders } = mockCheckout({ redemptions: [redemption] });
    const user = userEvent.setup();
    await renderCheckout();

    await user.click(await screen.findByRole("radio", { name: /Bebida gratis/ }));
    expect(await screen.findByText("Recompensa: Bebida gratis")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Confirmar pedido · 17,00/ })).toBeInTheDocument();

    await user.click(await screen.findByRole("radio", { name: "Efectivo al recoger" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Confirmar pedido/ })).toBeEnabled(),
    );
    await user.click(screen.getByRole("button", { name: /Confirmar pedido/ }));
    await waitFor(() => expect(orders).toHaveLength(1));
    expect(orders[0]).toMatchObject({ redemptionId: "d1" });
  });
});

describe("OrderView (cancel)", () => {
  function mockOrder(status: string) {
    const cancelled: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: URL | string) => {
        const path = new URL(String(url)).pathname.replace("/api/v1", "");
        if (path.endsWith("/cancel")) {
          cancelled.push(path);
          status = "CANCELLED";
        }
        if (path === "/me") return Response.json({ data: profile });
        return Response.json({ data: { ...placedOrder, status } });
      }),
    );
    return { cancelled };
  }

  it("lets the customer cancel a new order after confirming", async () => {
    const { cancelled } = mockOrder("NEW");
    const user = userEvent.setup();
    render(
      <ProfileProvider>
        <OrderView orderId={placedOrder.id} />
      </ProfileProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "Cancelar pedido" }));
    expect(cancelled).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Sí, cancelar" }));

    await waitFor(() => expect(cancelled).toEqual([`/orders/${placedOrder.id}/cancel`]));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Cancelar pedido" })).not.toBeInTheDocument(),
    );
    expect(await screen.findByText("Cancelado")).toBeInTheDocument();
  });

  it("does not offer to cancel an order that is already being prepared", async () => {
    mockOrder("PREPARING");
    render(
      <ProfileProvider>
        <OrderView orderId={placedOrder.id} />
      </ProfileProvider>,
    );
    expect(await screen.findByText(/Pedido nº 7/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancelar pedido" })).not.toBeInTheDocument();
  });
});
