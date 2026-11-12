import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
  auth: { onAuthStateChange: vi.fn(), signOut: vi.fn() },
}));

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: mocks.auth }) }));
vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
  usePathname: () => "/admin/carta",
}));

import { ProfileProvider } from "@/features/account/profile-context";
import { CatalogView } from "@/features/admin/catalog-view";
import { ClubView } from "@/features/admin/club-view";
import { PromotionsView } from "@/features/admin/promotions-view";
import { StoreView } from "@/features/admin/store-view";
import { PanelShell, RequirePermission } from "@/features/panel/panel-shell";

const ALL = [
  "dashboard:read",
  "catalog:manage",
  "settings:manage",
  "promotions:manage",
  "loyalty:manage",
  "customers:read",
  "audit:read",
];

const product = (overrides: object = {}) => ({
  id: "p1",
  slug: "margherita",
  categoryId: "c1",
  categoryName: "Pizzas",
  name: "Margherita",
  description: "Tomate y mozzarella",
  basePrice: "9.50",
  taxRate: "10.00",
  vegetarian: true,
  available: true,
  popular: false,
  sortOrder: 1,
  deleted: false,
  image: null,
  ingredients: ["tomate"],
  allergens: ["gluten"],
  optionGroups: [],
  ...overrides,
});

const settings = {
  name: "FORNEA",
  legalName: null,
  taxId: null,
  addressLine: "Calle Demo 1",
  postalCode: "28001",
  city: "Madrid",
  phone: "+34 600 000 000",
  email: "hola@forno.test",
  timezone: "Europe/Madrid",
  currency: "EUR",
  prepTimeMinutes: 20,
  deliveryTimeMinutes: 40,
  pickupEnabled: true,
  deliveryEnabled: true,
  ordersPaused: false,
  pausedMessage: null,
  enabledPaymentMethods: ["CASH_PICKUP"],
  slotMinutes: 15,
  maxAdvanceDays: 3,
};

const page = (rows: object[]) => ({
  data: rows,
  meta: { page: 1, pageSize: 10, total: rows.length, totalPages: 1 },
});

type Handler = (body: Record<string, unknown> | undefined) => Response;

function mockApi(permissions: string[] = ALL, handlers: Record<string, Handler> = {}) {
  const requests: Array<{ key: string; body?: Record<string, unknown> }> = [];
  const json = (data: unknown, status = 200) => Response.json({ data }, { status });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL | string, init: RequestInit = {}) => {
      const path = new URL(String(url)).pathname.replace("/api/v1", "");
      const method = init.method ?? "GET";
      const key = `${method} ${path}`;
      const body =
        typeof init.body === "string"
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : undefined;
      requests.push({ key, ...(body ? { body } : {}) });
      const handler = handlers[key];
      if (handler) return handler(body);
      if (path === "/me") {
        return json({
          id: "11111111-1111-4111-8111-111111111111",
          email: "admin@example.com",
          fullName: "Admin",
          username: "admin",
          phone: "+34 600 000 000",
          profileComplete: true,
          marketingConsent: false,
          roles: ["ADMIN"],
          permissions,
          createdAt: "2026-11-07T10:00:00.000Z",
        });
      }
      switch (key) {
        case "GET /admin/products":
          return json([product()]);
        case "GET /admin/categories":
          return json([
            {
              id: "c1",
              slug: "pizzas",
              name: "Pizzas",
              description: null,
              sortOrder: 1,
              active: true,
              productCount: 1,
            },
          ]);
        case "GET /admin/allergens":
          return json([
            { code: "gluten", name: "Gluten" },
            { code: "lactosa", name: "Lácteos" },
          ]);
        case "GET /admin/store/settings":
          return json(settings);
        case "GET /admin/store/opening-hours":
          return json([{ dayOfWeek: 1, openMinute: 780, closeMinute: 960 }]);
        case "GET /admin/store/special-days":
        case "GET /admin/delivery-zones":
        case "GET /admin/promotions":
        case "GET /admin/rewards":
          return json([]);
        case "GET /admin/loyalty/settings":
          return json({ pointsPerEuro: "1", expiryDays: null });
        case "GET /admin/customers":
          return Response.json(
            page([
              {
                id: "u1",
                fullName: "Ana López",
                username: "ana",
                email: "ana@example.com",
                phone: null,
                orders: 3,
                balance: 40,
                lifetimeEarned: 60,
                createdAt: "2026-11-01T10:00:00.000Z",
              },
            ]),
          );
        default:
          return json([]);
      }
    }),
  );
  return { requests, sent: (key: string) => requests.filter((request) => request.key === key) };
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
  mocks.auth.onAuthStateChange.mockImplementation((callback: (e: string, s: unknown) => void) => {
    callback("INITIAL_SESSION", { access_token: "admin-token" });
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("panel navigation", () => {
  it("shows only the sections the role may use", async () => {
    mockApi(["dashboard:read", "catalog:manage"]);
    render(
      <PanelShell>
        <p>contenido</p>
      </PanelShell>,
    );
    expect(await screen.findByRole("link", { name: /carta/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /establecimiento/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /auditoría/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /fornea club/i })).not.toBeInTheDocument();
  });

  it("blocks a screen without its permission", async () => {
    mockApi(["dashboard:read"]);
    renderWith(
      <RequirePermission permission="catalog:manage">
        <CatalogView />
      </RequirePermission>,
    );
    expect(await screen.findByText("Sin permiso")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Carta" })).not.toBeInTheDocument();
  });
});

describe("menu administration", () => {
  it("creates a product sending prices as text, allergens by code and option groups", async () => {
    const api = mockApi(ALL, {
      "POST /admin/products": () => Response.json({ data: product() }, { status: 201 }),
    });
    const user = userEvent.setup();
    renderWith(<CatalogView />);
    await user.click(await screen.findByRole("button", { name: "Nuevo producto" }));

    await user.type(await screen.findByLabelText("Nombre"), "Diavola");
    await user.selectOptions(screen.getByLabelText("Categoría"), "c1");
    await user.type(screen.getByLabelText("Descripción"), "Salami picante");
    const price = screen.getByLabelText("Precio (€, IVA incluido)");
    await user.clear(price);
    await user.type(price, "11.50");
    await user.type(screen.getByLabelText("Ingredientes"), "tomate, salami ,");
    await user.click(await screen.findByRole("checkbox", { name: "Gluten" }));
    await user.click(screen.getByRole("button", { name: "Añadir grupo" }));
    await user.type(screen.getByLabelText("Nombre del grupo"), "Tamaño");
    await user.type(screen.getByLabelText(/Opción 1 \(grupo 1\)/), "Mediana");
    await user.click(screen.getByRole("button", { name: "Crear producto" }));

    await waitFor(() => expect(api.sent("POST /admin/products")).toHaveLength(1));
    expect(api.sent("POST /admin/products")[0]!.body).toMatchObject({
      categoryId: "c1",
      name: "Diavola",
      basePrice: "11.50",
      ingredients: ["tomate", "salami"],
      allergens: ["gluten"],
      image: null,
      optionGroups: [
        {
          name: "Tamaño",
          kind: "EXTRA",
          options: [{ name: "Mediana", priceDelta: "0.00", isDefault: false, available: true }],
        },
      ],
    });
  });

  it("marks a product sold out by sending only that field", async () => {
    const api = mockApi(ALL, {
      "PATCH /admin/products/p1": () => Response.json({ data: product({ available: false }) }),
    });
    const user = userEvent.setup();
    renderWith(<CatalogView />);
    await user.click(await screen.findByRole("button", { name: /Marcar agotado: Margherita/ }));
    await waitFor(() => expect(api.sent("PATCH /admin/products/p1")).toHaveLength(1));
    expect(api.sent("PATCH /admin/products/p1")[0]!.body).toEqual({ available: false });
  });

  it("explains that photo upload is not configured yet", async () => {
    mockApi(ALL);
    const fetchMock = vi.mocked(fetch);
    const base = fetchMock.getMockImplementation();
    fetchMock.mockImplementation(async (url, init) =>
      String(url).endsWith("/uploads/product-image")
        ? Response.json(
            { error: { code: "STORAGE_NOT_CONFIGURED", message: "x" } },
            { status: 503 },
          )
        : base!(url, init),
    );
    const user = userEvent.setup();
    renderWith(<CatalogView />);
    await user.click(await screen.findByRole("button", { name: "Nuevo producto" }));
    const input = await screen.findByLabelText(/Subir una foto/);
    await user.upload(
      input,
      new File([new Uint8Array([1, 2, 3])], "foto.png", { type: "image/png" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /subida de fotos aún no está configurada/i,
    );
  });
});

describe("store administration", () => {
  it("pauses orders sending only the pause fields", async () => {
    const api = mockApi(ALL, {
      "PATCH /admin/store/settings": () =>
        Response.json({ data: { ...settings, ordersPaused: true } }),
    });
    const user = userEvent.setup();
    renderWith(<StoreView />);
    await user.click(await screen.findByRole("checkbox", { name: /Pausar la recepción/ }));
    await user.type(screen.getByLabelText(/Mensaje para los clientes/), "Volvemos pronto");
    await user.click(screen.getByRole("button", { name: "Aplicar" }));
    await waitFor(() => expect(api.sent("PATCH /admin/store/settings")).toHaveLength(1));
    expect(api.sent("PATCH /admin/store/settings")[0]!.body).toEqual({
      ordersPaused: true,
      pausedMessage: "Volvemos pronto",
    });
  });

  it("saves the weekly hours as minutes", async () => {
    const api = mockApi(ALL, {
      "PUT /admin/store/opening-hours": () => Response.json({ data: [] }),
    });
    const user = userEvent.setup();
    renderWith(<StoreView />);
    await user.click((await screen.findAllByRole("button", { name: "Añadir tramo" }))[1]!);
    await user.click(screen.getByRole("button", { name: "Guardar horario" }));
    await waitFor(() => expect(api.sent("PUT /admin/store/opening-hours")).toHaveLength(1));
    expect(api.sent("PUT /admin/store/opening-hours")[0]!.body).toEqual({
      slots: [
        { dayOfWeek: 1, openMinute: 780, closeMinute: 960 },
        { dayOfWeek: 2, openMinute: 780, closeMinute: 960 },
      ],
    });
  });

  it("creates a delivery zone splitting the postal codes", async () => {
    const api = mockApi(ALL, {
      "POST /admin/delivery-zones": () =>
        Response.json(
          {
            data: {
              id: "z1",
              name: "Centro",
              postalCodes: ["28001"],
              deliveryFee: "2.50",
              minimumOrder: "12.00",
              estimatedMinutes: 40,
              active: true,
            },
          },
          { status: 201 },
        ),
    });
    const user = userEvent.setup();
    renderWith(<StoreView />);
    await user.click(await screen.findByRole("button", { name: "Nueva zona" }));
    await user.type(screen.getByLabelText("Nombre de la zona"), "Centro");
    await user.type(screen.getByLabelText("Códigos postales"), "28001, 28002;28003");
    const fee = screen.getByLabelText("Gastos de envío (€)");
    await user.clear(fee);
    await user.type(fee, "2.50");
    await user.click(screen.getByRole("button", { name: "Crear zona" }));
    await waitFor(() => expect(api.sent("POST /admin/delivery-zones")).toHaveLength(1));
    expect(api.sent("POST /admin/delivery-zones")[0]!.body).toMatchObject({
      name: "Centro",
      postalCodes: ["28001", "28002", "28003"],
      deliveryFee: "2.50",
      active: true,
    });
  });

  it("shows a clear message when a postal code belongs to another zone", async () => {
    mockApi(ALL, {
      "POST /admin/delivery-zones": () =>
        Response.json({ error: { code: "POSTAL_CODE_IN_USE", message: "x" } }, { status: 422 }),
    });
    const user = userEvent.setup();
    renderWith(<StoreView />);
    await user.click(await screen.findByRole("button", { name: "Nueva zona" }));
    await user.type(screen.getByLabelText("Nombre de la zona"), "Norte");
    await user.type(screen.getByLabelText("Códigos postales"), "28001");
    await user.click(screen.getByRole("button", { name: "Crear zona" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/ya pertenece a otra zona/i);
  });
});

describe("promotions and FORNEA CLUB", () => {
  it("creates an automatic percentage promotion", async () => {
    const api = mockApi(ALL, {
      "POST /admin/promotions": () => Response.json({ data: {} }, { status: 201 }),
    });
    const user = userEvent.setup();
    renderWith(<PromotionsView />);
    await user.click(await screen.findByRole("button", { name: "Nueva promoción" }));
    await user.type(await screen.findByLabelText("Nombre"), "Primer pedido");
    await user.type(screen.getByLabelText("Descripción"), "10 % en tu primer pedido");
    await user.click(screen.getByRole("checkbox", { name: /Automática/ }));
    await user.click(screen.getByRole("checkbox", { name: "Solo el primer pedido" }));
    await user.click(screen.getByRole("button", { name: "Crear promoción" }));
    await waitFor(() => expect(api.sent("POST /admin/promotions")).toHaveLength(1));
    expect(api.sent("POST /admin/promotions")[0]!.body).toMatchObject({
      name: "Primer pedido",
      kind: "DISCOUNT",
      discountType: "PERCENT",
      discountValue: "10",
      automatic: true,
      firstOrderOnly: true,
      active: true,
      products: [],
    });
  });

  it("saves the points rule", async () => {
    const api = mockApi(ALL, {
      "PATCH /admin/loyalty/settings": () =>
        Response.json({ data: { pointsPerEuro: "2", expiryDays: 365 } }),
    });
    const user = userEvent.setup();
    renderWith(<ClubView />);
    const points = await screen.findByLabelText(/Puntos por cada euro/);
    await user.clear(points);
    await user.type(points, "2");
    await user.type(screen.getByLabelText(/Caducidad de los puntos/), "365");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(api.sent("PATCH /admin/loyalty/settings")).toHaveLength(1));
    expect(api.sent("PATCH /admin/loyalty/settings")[0]!.body).toEqual({
      pointsPerEuro: "2",
      expiryDays: 365,
    });
  });

  it("adjusts a customer's points with a reason and shows the new balance", async () => {
    const api = mockApi(ALL, {
      "POST /admin/loyalty/adjustments": () =>
        Response.json({ data: { balance: 55 } }, { status: 201 }),
    });
    const user = userEvent.setup();
    renderWith(<ClubView />);
    await user.click(await screen.findByRole("tab", { name: "Clientes y ajustes" }));
    await user.click(await screen.findByRole("button", { name: "Ajustar puntos de Ana López" }));
    await user.type(screen.getByLabelText(/Puntos \(negativos/), "15");
    await user.type(screen.getByLabelText(/Motivo/), "Compensación por retraso");
    await user.click(screen.getByRole("button", { name: "Aplicar ajuste" }));
    await waitFor(() => expect(api.sent("POST /admin/loyalty/adjustments")).toHaveLength(1));
    expect(api.sent("POST /admin/loyalty/adjustments")[0]!.body).toEqual({
      userId: "u1",
      points: 15,
      reason: "Compensación por retraso",
    });
    expect(await screen.findByText(/Nuevo saldo: 55 puntos/)).toBeInTheDocument();
  });
});
