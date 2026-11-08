import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
  auth: { onAuthStateChange: vi.fn(), signOut: vi.fn() },
  pathname: "/admin",
}));

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: mocks.auth }) }));
vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
  usePathname: () => mocks.pathname,
}));

import { ProfileProvider } from "@/features/account/profile-context";
import { DashboardView } from "@/features/panel/dashboard-view";
import { KitchenBoard, nextKitchenStep } from "@/features/panel/kitchen-board";
import { connectOrderStream, parseSseChunk } from "@/features/panel/order-stream";
import { OrderDetailView } from "@/features/panel/order-detail-view";
import { OrdersListView } from "@/features/panel/orders-list-view";
import { PanelShell, RequirePermission } from "@/features/panel/panel-shell";
import { needsReason } from "@/features/panel/panel-api";

function profile(permissions: string[], roles: string[] = ["STAFF"]) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    email: "staff@example.com",
    fullName: "Marta Personal",
    username: "marta",
    phone: "+34 600 000 000",
    profileComplete: true,
    marketingConsent: false,
    roles,
    permissions,
    createdAt: "2026-11-07T10:00:00.000Z",
  };
}

const STAFF = [
  "dashboard:read",
  "orders:read:all",
  "orders:update-status",
  "kitchen:orders:read",
  "kitchen:orders:update-status",
  "payments:read",
];
const KITCHEN = ["kitchen:orders:read", "kitchen:orders:update-status"];

const kitchenOrder = (overrides: object = {}) => ({
  id: "k1",
  orderNumber: 12,
  status: "NEW",
  type: "PICKUP",
  placedAt: new Date().toISOString(),
  scheduledFor: null,
  estimatedReadyAt: null,
  notes: "Sin gluten, por favor",
  items: [
    { quantity: 2, name: "Margherita", options: ["Mediana", "Clásica"], notes: "Sin albahaca" },
  ],
  ...overrides,
});

const adminOrder = (overrides: object = {}) => ({
  id: "a1",
  orderNumber: 7,
  status: "NEW",
  type: "DELIVERY",
  placedAt: "2026-11-10T11:00:00.000Z",
  scheduledFor: null,
  estimatedReadyAt: "2026-11-10T11:40:00.000Z",
  notes: "Llamar al timbre",
  cancellationReason: null,
  couponCode: null,
  customer: { name: "Ana López", email: "ana@example.com", phone: "+34 600 111 222" },
  delivery: {
    name: "Ana",
    line1: "Calle Mayor 1",
    line2: null,
    postalCode: "28001",
    city: "Madrid",
    notes: null,
    zone: "Centro",
  },
  items: [
    {
      id: "i1",
      productName: "Margherita",
      quantity: 2,
      unitPrice: "9.50",
      lineTotal: "19.00",
      notes: null,
      options: [{ group: "Tamaño", name: "Mediana", priceDelta: "0.00" }],
    },
  ],
  discounts: [],
  totals: { subtotal: "19.00", discount: "0.00", deliveryFee: "2.50", tax: "1.95", total: "21.50" },
  payments: [{ method: "CASH_DELIVERY", status: "CASH_PENDING", amount: "21.50", paidAt: null }],
  history: [{ from: null, status: "NEW", at: "2026-11-10T11:00:00.000Z", by: null, reason: null }],
  allowedNext: ["ACCEPTED", "REJECTED", "CANCELLED"],
  ...overrides,
});

interface Api {
  permissions: string[];
  roles?: string[];
  kitchen?: object[];
  order?: object;
  onPatch?: (path: string, body: Record<string, unknown>) => Response;
  dashboard?: object;
  list?: object[];
}

function mockApi(options: Api) {
  const requests: Array<{
    path: string;
    method: string;
    body?: Record<string, unknown>;
    query: URLSearchParams;
  }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL | string, init: RequestInit = {}) => {
      const parsed = new URL(String(url));
      const path = parsed.pathname.replace("/api/v1", "");
      const method = init.method ?? "GET";
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      requests.push({ path, method, body, query: parsed.searchParams });
      const json = (data: unknown, status = 200) => Response.json({ data }, { status });
      if (path.endsWith("/stream")) return new Response(null, { status: 503 });
      if (path === "/me") return json(profile(options.permissions, options.roles));
      if (path === "/kitchen/orders") return json(options.kitchen ?? []);
      if (path.startsWith("/kitchen/orders/") && method === "PATCH") {
        return options.onPatch
          ? options.onPatch(path, body ?? {})
          : json(kitchenOrder({ status: body?.["status"] }));
      }
      if (path === "/admin/dashboard") return json(options.dashboard);
      if (path === "/admin/orders") {
        const rows = options.list ?? [];
        return Response.json({
          data: rows,
          meta: { page: 1, pageSize: 15, total: rows.length, totalPages: 1 },
        });
      }
      if (path.startsWith("/admin/orders/") && path.endsWith("/status")) {
        return options.onPatch
          ? options.onPatch(path, body ?? {})
          : json(adminOrder({ status: body?.["status"], allowedNext: [] }));
      }
      if (path.startsWith("/admin/orders/")) return json(options.order ?? adminOrder());
      return json([]);
    }),
  );
  return { requests };
}

function renderWith(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ProfileProvider>
      <QueryClientProvider client={client}>{node}</QueryClientProvider>
    </ProfileProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.pathname = "/admin";
  mocks.auth.onAuthStateChange.mockImplementation((callback: (e: string, s: unknown) => void) => {
    callback("INITIAL_SESSION", { access_token: "staff-token" });
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SSE parsing", () => {
  it("splits complete messages, ignores heartbeats and keeps the unfinished rest", () => {
    const first = parseSseChunk(
      'retry: 5000\n\n: ping\n\nevent: order\ndata: {"a":1}\n\nevent: order\ndata: {"b"',
    );
    expect(first.events).toEqual([{ event: "order", data: '{"a":1}' }]);
    expect(first.rest).toBe('event: order\ndata: {"b"');
    const second = parseSseChunk(`${first.rest}:2}\n\n`);
    expect(second.events).toEqual([{ event: "order", data: '{"b":2}' }]);
  });

  it("connects with the Authorization header (never the URL), reports events and reconnects when cut", async () => {
    const encoder = new TextEncoder();
    const seen: Array<{ url: string; auth: string | null }> = [];
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls += 1;
        seen.push({ url: String(url), auth: new Headers(init.headers).get("Authorization") });
        if (calls > 1) return new Response(null, { status: 503 });
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                'event: order\ndata: {"kind":"status","orderId":"o1","orderNumber":1,"status":"READY"}\n\n',
              ),
            );
            controller.close();
          },
        });
        return new Response(stream, { status: 200 });
      }),
    );
    const controller = new AbortController();
    const events: unknown[] = [];
    const states: boolean[] = [];
    const done = connectOrderStream({
      url: "http://localhost/api/v1/kitchen/stream",
      getToken: () => "tok-1",
      onEvent: (event) => events.push(event),
      onStatus: (connected) => states.push(connected),
      signal: controller.signal,
    });
    await waitFor(() => expect(events).toHaveLength(1));
    expect(events[0]).toMatchObject({ orderId: "o1", status: "READY" });
    expect(seen[0]).toEqual({
      url: "http://localhost/api/v1/kitchen/stream",
      auth: "Bearer tok-1",
    });
    expect(seen[0]!.url).not.toContain("tok-1");
    expect(states).toContain(true);
    controller.abort();
    await done;
  });
});

describe("kitchen rules", () => {
  it("gives the kitchen only the steps it may take", () => {
    expect(nextKitchenStep({ status: "NEW", type: "PICKUP" })).toMatchObject({ to: "ACCEPTED" });
    expect(nextKitchenStep({ status: "ACCEPTED", type: "PICKUP" })).toMatchObject({
      to: "PREPARING",
    });
    expect(nextKitchenStep({ status: "PREPARING", type: "DELIVERY" })).toMatchObject({
      to: "READY",
    });
    expect(nextKitchenStep({ status: "READY", type: "PICKUP" })).toMatchObject({ to: "COMPLETED" });
    expect(nextKitchenStep({ status: "READY", type: "DELIVERY" })).toBeNull();
    expect(nextKitchenStep({ status: "COMPLETED", type: "PICKUP" })).toBeNull();
  });

  it("asks for a reason only when rejecting or returning a completed order", () => {
    expect(needsReason("NEW", "REJECTED")).toBe(true);
    expect(needsReason("COMPLETED", "CANCELLED")).toBe(true);
    expect(needsReason("NEW", "CANCELLED")).toBe(false);
    expect(needsReason("NEW", "ACCEPTED")).toBe(false);
  });
});

describe("KitchenBoard", () => {
  it("shows the orders in their columns with what to prepare", async () => {
    mockApi({
      permissions: KITCHEN,
      roles: ["KITCHEN"],
      kitchen: [
        kitchenOrder(),
        kitchenOrder({ id: "k2", orderNumber: 13, status: "PREPARING", notes: null }),
        kitchenOrder({ id: "k3", orderNumber: 14, status: "READY", type: "DELIVERY", notes: null }),
      ],
    });
    renderWith(<KitchenBoard />);

    const nuevos = await screen.findByRole("region", { name: "Nuevos" });
    expect(within(nuevos).getByText("#12")).toBeInTheDocument();
    expect(within(nuevos).getByText(/Sin albahaca/)).toBeInTheDocument();
    expect(within(nuevos).getByText(/Sin gluten, por favor/)).toBeInTheDocument();
    expect(within(nuevos).getByText("Mediana · Clásica")).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "En preparación" })).getByText("#13"),
    ).toBeInTheDocument();
    // Un pedido a domicilio listo espera al repartidor: la cocina no lo cierra.
    const listos = screen.getByRole("region", { name: "Listos" });
    expect(within(listos).getByText("Esperando al repartidor")).toBeInTheDocument();
    expect(within(listos).queryByRole("button")).not.toBeInTheDocument();
  });

  it("advances an order with the quick action and refreshes", async () => {
    const { requests } = mockApi({
      permissions: KITCHEN,
      roles: ["KITCHEN"],
      kitchen: [kitchenOrder()],
    });
    const user = userEvent.setup();
    renderWith(<KitchenBoard />);

    await user.click(await screen.findByRole("button", { name: "Aceptar" }));
    await waitFor(() =>
      expect(
        requests.some(
          (request) => request.method === "PATCH" && request.path === "/kitchen/orders/k1/status",
        ),
      ).toBe(true),
    );
    expect(requests.find((request) => request.method === "PATCH")?.body).toEqual({
      status: "ACCEPTED",
    });
  });

  it("explains a rejected change in Spanish", async () => {
    mockApi({
      permissions: KITCHEN,
      roles: ["KITCHEN"],
      kitchen: [kitchenOrder()],
      onPatch: () =>
        Response.json(
          { error: { code: "INVALID_TRANSITION", message: "x", requestId: "r" } },
          { status: 409 },
        ),
    });
    const user = userEvent.setup();
    renderWith(<KitchenBoard />);
    await user.click(await screen.findByRole("button", { name: "Aceptar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Pedido 12: Ese cambio ya no es posible/,
    );
  });

  it("never asks the server for customer data", async () => {
    const { requests } = mockApi({
      permissions: KITCHEN,
      roles: ["KITCHEN"],
      kitchen: [kitchenOrder()],
    });
    renderWith(<KitchenBoard />);
    await screen.findByText("#12");
    expect(
      requests.map((request) => request.path).filter((path) => path.startsWith("/admin")),
    ).toEqual([]);
  });
});

describe("PanelShell and permissions", () => {
  it("shows only the sections the role can use", async () => {
    mockApi({ permissions: KITCHEN, roles: ["KITCHEN"] });
    mocks.pathname = "/kitchen";
    render(
      <PanelShell>
        <p>contenido</p>
      </PanelShell>,
    );
    const nav = await screen.findByRole("navigation", { name: "Navegación del panel" });
    expect(within(nav).getByRole("link", { name: "Cocina" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).queryByRole("link", { name: "Pedidos" })).not.toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: "Panel" })).not.toBeInTheDocument();
  });

  it("blocks the screen for a customer without staff permissions", async () => {
    mockApi({ permissions: ["orders:create"], roles: [] });
    render(
      <PanelShell>
        <p>contenido secreto</p>
      </PanelShell>,
    );
    expect(await screen.findByRole("heading", { name: "Acceso restringido" })).toBeInTheDocument();
    expect(screen.queryByText("contenido secreto")).not.toBeInTheDocument();
  });

  it("hides a page whose permission the role lacks", async () => {
    mockApi({ permissions: KITCHEN, roles: ["KITCHEN"] });
    renderWith(
      <RequirePermission permission="orders:read:all">
        <p>listado</p>
      </RequirePermission>,
    );
    expect(await screen.findByRole("heading", { name: "Sin permiso" })).toBeInTheDocument();
    expect(screen.queryByText("listado")).not.toBeInTheDocument();
  });
});

describe("DashboardView", () => {
  it("shows today's counters, sales, popular products and recent orders", async () => {
    mockApi({
      permissions: STAFF,
      dashboard: {
        date: "2026-11-10",
        orders: { total: 9, pending: 2, preparing: 3, ready: 1, completed: 2, cancelled: 1 },
        sales: { completed: "48.50", inProgress: "61.00", averageTicket: "24.25" },
        popularProducts: [{ name: "Margherita", quantity: 12 }],
        recentOrders: [
          {
            id: "a1",
            orderNumber: 7,
            status: "NEW",
            type: "PICKUP",
            customerName: "Ana López",
            total: "19.00",
            placedAt: "2026-11-10T11:00:00.000Z",
          },
        ],
      },
    });
    renderWith(<DashboardView />);

    expect(await screen.findByRole("heading", { name: "Panel de control" })).toBeInTheDocument();
    expect(screen.getByText("Pedidos de hoy").nextElementSibling).toHaveTextContent("9");
    expect(screen.getByText("Pendientes").nextElementSibling).toHaveTextContent("2");
    expect(screen.getByText("Ventas (completados)").nextElementSibling).toHaveTextContent("48,50");
    expect(screen.getByText("Ticket medio").nextElementSibling).toHaveTextContent("24,25");
    expect(screen.getByText("Margherita")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Pedido nº 7/ })).toHaveAttribute(
      "href",
      "/admin/pedidos/a1",
    );
  });
});

describe("OrdersListView", () => {
  it("filters through the API and links to each order", async () => {
    const { requests } = mockApi({
      permissions: STAFF,
      list: [
        {
          id: "a1",
          orderNumber: 7,
          status: "NEW",
          type: "DELIVERY",
          customerName: "Ana López",
          total: "21.50",
          itemCount: 2,
          placedAt: "2026-11-10T11:00:00.000Z",
          scheduledFor: null,
          payment: null,
        },
      ],
    });
    const user = userEvent.setup();
    renderWith(<OrdersListView />);

    const link = await screen.findByRole("link", { name: /#7/ });
    expect(link).toHaveAttribute("href", "/admin/pedidos/a1");
    expect(
      requests.find((request) => request.path === "/admin/orders")?.query.get("status"),
    ).toMatch(/NEW/);

    await user.click(screen.getByRole("tab", { name: "Completados" }));
    await waitFor(() =>
      expect(
        requests.some(
          (request) =>
            request.path === "/admin/orders" && request.query.get("status") === "COMPLETED",
        ),
      ).toBe(true),
    );
    await user.type(screen.getByLabelText("Buscar"), "ana");
    await user.click(screen.getByRole("button", { name: "Buscar" }));
    await waitFor(() =>
      expect(requests.some((request) => request.query.get("q") === "ana")).toBe(true),
    );
  });
});

describe("OrderDetailView", () => {
  it("shows the full order and applies a valid change", async () => {
    const { requests } = mockApi({ permissions: STAFF });
    const user = userEvent.setup();
    renderWith(<OrderDetailView orderId="a1" />);

    expect(await screen.findByRole("heading", { name: "Pedido nº 7" })).toBeInTheDocument();
    expect(screen.getByText("Ana López")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "+34 600 111 222" })).toHaveAttribute(
      "href",
      "tel:+34600111222",
    );
    expect(screen.getByText(/Calle Mayor 1/)).toBeInTheDocument();
    expect(screen.getByText("Llamar al timbre")).toBeInTheDocument();
    expect(screen.getByText(/Efectivo al recibir/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Aceptar pedido" }));
    await waitFor(() =>
      expect(requests.find((request) => request.method === "PATCH")?.body).toEqual({
        status: "ACCEPTED",
      }),
    );
  });

  it("asks for confirmation and a reason before rejecting", async () => {
    const { requests } = mockApi({ permissions: STAFF });
    const user = userEvent.setup();
    renderWith(<OrderDetailView orderId="a1" />);

    await user.click(await screen.findByRole("button", { name: "Rechazar pedido" }));
    expect(requests.some((request) => request.method === "PATCH")).toBe(false);
    const confirm = screen.getByRole("button", { name: "Confirmar" });
    expect(confirm).toBeDisabled(); // el motivo es obligatorio
    await user.type(screen.getByLabelText(/Motivo/), "Sin existencias");
    await user.click(confirm);
    await waitFor(() =>
      expect(requests.find((request) => request.method === "PATCH")?.body).toEqual({
        status: "REJECTED",
        reason: "Sin existencias",
      }),
    );
  });

  it("offers a return for a completed order and nothing for a closed one", async () => {
    mockApi({
      permissions: STAFF,
      order: adminOrder({ status: "COMPLETED", allowedNext: ["CANCELLED"] }),
    });
    const { unmount } = renderWith(<OrderDetailView orderId="a1" />);
    expect(await screen.findByRole("button", { name: "Devolver / cancelar" })).toBeInTheDocument();
    unmount();

    mockApi({
      permissions: STAFF,
      order: adminOrder({ status: "CANCELLED", allowedNext: [], cancellationReason: "Cliente" }),
    });
    renderWith(<OrderDetailView orderId="a1" />);
    expect(await screen.findByText(/Este pedido está cerrado/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Aceptar|Rechazar|Completar/ }),
    ).not.toBeInTheDocument();
  });

  it("hides the payment section when the API does not send it", async () => {
    mockApi({ permissions: ["orders:read:all"], order: adminOrder({ payments: null }) });
    renderWith(<OrderDetailView orderId="a1" />);
    await screen.findByRole("heading", { name: "Pedido nº 7" });
    expect(screen.queryByRole("heading", { name: "Pago" })).not.toBeInTheDocument();
  });

  it("explains a conflict and refreshes the order", async () => {
    mockApi({
      permissions: STAFF,
      onPatch: () =>
        Response.json(
          { error: { code: "INVALID_TRANSITION", message: "x", requestId: "r" } },
          { status: 409 },
        ),
    });
    const user = userEvent.setup();
    renderWith(<OrderDetailView orderId="a1" />);
    await user.click(await screen.findByRole("button", { name: "Aceptar pedido" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Ese cambio ya no es posible/);
  });
});
