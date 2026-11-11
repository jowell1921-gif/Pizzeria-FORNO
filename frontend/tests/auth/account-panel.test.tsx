import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  client: null as unknown,
  session: null as unknown,
  router: { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() },
  auth: { signOut: vi.fn(), onAuthStateChange: vi.fn(), updateUser: vi.fn() },
}));

vi.mock("@/lib/supabase/client", () => ({ createClient: () => mocks.client }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router, usePathname: () => "/" }));

import { AccountPanel } from "@/features/account/account-panel";
import { ProfileProvider } from "@/features/account/profile-context";
import { AuthMenu } from "@/features/auth/auth-menu";

const incomplete = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "ana@example.com",
  fullName: "Ana López",
  username: null,
  phone: null,
  profileComplete: false,
  marketingConsent: false,
  roles: [],
  permissions: ["profile:read:own"],
  createdAt: "2026-11-07T10:00:00.000Z",
};
const complete = {
  ...incomplete,
  username: "ana_l",
  phone: "+34 600 000 000",
  profileComplete: true,
};

const loyalty = {
  balance: 120,
  lifetimeEarned: 300,
  pointsPerEuro: "1",
  expiryDays: null,
  availableRewards: 1,
  nextReward: null,
};

/** Responde a cada endpoint de la API según su ruta. */
function mockApi(profile: object, onPatch?: (body: unknown) => object) {
  const fetchMock = vi.fn((url: URL | string, init: RequestInit = {}) => {
    const path = new URL(String(url)).pathname.replace("/api/v1", "");
    if (path === "/me" && init.method === "PATCH") {
      return Promise.resolve(Response.json({ data: onPatch?.(JSON.parse(init.body as string)) }));
    }
    if (path === "/me") return Promise.resolve(Response.json({ data: profile }));
    if (path === "/loyalty/account") return Promise.resolve(Response.json({ data: loyalty }));
    if (path === "/me/addresses") return Promise.resolve(Response.json({ data: [] }));
    const meta = { page: 1, pageSize: 5, total: 0, totalPages: 0 };
    return Promise.resolve(Response.json({ data: [], meta }));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderPanel() {
  return render(
    <ProfileProvider>
      <AuthMenu />
      <AccountPanel />
    </ProfileProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.client = { auth: mocks.auth };
  mocks.session = { access_token: "access-token-1" };
  mocks.auth.onAuthStateChange.mockImplementation((callback: (e: string, s: unknown) => void) => {
    callback("INITIAL_SESSION", mocks.session);
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AccountPanel", () => {
  it("invites anonymous visitors to sign in", () => {
    mocks.session = null;
    renderPanel();
    expect(screen.getByRole("link", { name: "Iniciar sesión" })).toHaveAttribute(
      "href",
      "/acceso?next=/cuenta",
    );
    expect(screen.getByRole("link", { name: "Acceder" })).toBeInTheDocument();
  });

  it("asks a new customer to complete the data, with a required phone", async () => {
    const fetchMock = mockApi(incomplete);
    renderPanel();

    expect(await screen.findByRole("heading", { name: "Completa tus datos" })).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("http://localhost:4000/api/v1/me");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer access-token-1");
    expect(screen.getByLabelText("Nombre de usuario")).toHaveAttribute("maxlength", "12");
    expect(screen.getByRole("link", { name: "Mi cuenta" })).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Nombre de usuario"), "ana_l");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByText("Introduce tu teléfono")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, i]) => i?.method === "PATCH")).toBe(false);
  });

  it("saves the data, updates the header button and goes to the home page", async () => {
    const fetchMock = mockApi(incomplete, () => complete);
    const user = userEvent.setup();
    renderPanel();

    await user.type(await screen.findByLabelText("Nombre de usuario"), "ana_l");
    await user.type(screen.getByLabelText("Teléfono"), "+34 600 000 000");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(mocks.router.push).toHaveBeenCalledWith("/"));
    const patch = fetchMock.mock.calls.find(([, i]) => i?.method === "PATCH")!;
    expect(JSON.parse(patch[1]!.body as string)).toEqual({
      fullName: "Ana López",
      username: "ana_l",
      phone: "+34 600 000 000",
      marketingConsent: false,
    });
    expect(screen.getByRole("link", { name: /Mi cuenta:\s*ana_l/ })).toHaveTextContent("ana_l");
  });

  it("shows the dashboard with points and addresses once the data is complete", async () => {
    mockApi(complete);
    renderPanel();

    expect(await screen.findByText("Hola, ana_l")).toBeInTheDocument();
    expect(await screen.findByTestId("points-balance")).toHaveTextContent("120");
    expect(screen.getByRole("heading", { name: "Mis direcciones" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Seguridad" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Mi cuenta:\s*ana_l/ })).toHaveTextContent("ana_l");
  });

  it("shows the staff roles in Spanish", async () => {
    mockApi({ ...complete, roles: ["STAFF", "KITCHEN"] });
    renderPanel();

    expect(await screen.findByText("Personal")).toBeInTheDocument();
    expect(screen.getByText("Cocina")).toBeInTheDocument();
  });

  it("explains an invalid session and a disabled account", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          Response.json({ error: { code: "INVALID_TOKEN", message: "x" } }, { status: 401 }),
        ),
      ),
    );
    const { unmount } = renderPanel();
    expect(await screen.findByRole("alert")).toHaveTextContent(/sesión no es válida/);
    unmount();

    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          Response.json({ error: { code: "ACCOUNT_DISABLED", message: "x" } }, { status: 403 }),
        ),
      ),
    );
    renderPanel();
    expect(await screen.findByRole("alert")).toHaveTextContent(/cuenta está desactivada/);
  });

  it("explains that the backend is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("fetch failed"))),
    );
    renderPanel();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /No se pudo conectar con el servidor/,
    );
  });

  it("signs out and returns to the home page", async () => {
    mockApi(complete);
    mocks.auth.signOut.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole("button", { name: "Cerrar sesión" }));

    await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith("/"));
    expect(mocks.auth.signOut).toHaveBeenCalled();
  });
});
