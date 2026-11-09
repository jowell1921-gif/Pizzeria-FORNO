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
  usePathname: () => "/",
}));

import { HeaderAction } from "@/components/layout/header-action";
import { AdminOfferDialog, AdminRoleButton } from "@/features/account/admin-role";
import { ProfileProvider } from "@/features/account/profile-context";

const base = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "ana@example.com",
  fullName: "Ana López",
  username: "ana_l",
  phone: "+34 600 000 000",
  profileComplete: true,
  marketingConsent: false,
  roles: [] as string[],
  permissions: ["profile:read:own"],
  selfAdminAvailable: true,
  createdAt: "2026-11-07T10:00:00.000Z",
};
const admin = {
  ...base,
  roles: ["ADMIN"],
  permissions: ["profile:read:own", "orders:read:all", "catalog:manage"],
};

function mockApi(profile: object, onChange?: (method: string) => Response) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL | string, init: RequestInit = {}) => {
      const path = new URL(String(url)).pathname.replace("/api/v1", "");
      if (path === "/me/admin-role") {
        calls.push(init.method ?? "GET");
        return (
          onChange?.(init.method ?? "GET") ??
          Response.json({ data: init.method === "PUT" ? admin : base })
        );
      }
      return Response.json({ data: profile });
    }),
  );
  return calls;
}

function renderWith(node: React.ReactNode) {
  return render(<ProfileProvider>{node}</ProfileProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.auth.onAuthStateChange.mockImplementation((callback: (e: string, s: unknown) => void) => {
    callback("INITIAL_SESSION", { access_token: "token" });
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("header action next to the cart", () => {
  it("offers the menu to customers", async () => {
    mockApi(base);
    renderWith(<HeaderAction />);
    expect(screen.getByRole("link", { name: "Pedir ahora" })).toHaveAttribute("href", "/carta");
  });

  it("shows the staff panel instead of «Pedir ahora» to staff", async () => {
    mockApi(admin);
    renderWith(<HeaderAction />);
    const link = await screen.findByRole("link", { name: "Panel del personal" });
    expect(link).toHaveAttribute("href", "/admin");
    expect(screen.queryByRole("link", { name: "Pedir ahora" })).not.toBeInTheDocument();
  });

  it("sends kitchen-only staff to the kitchen screen", async () => {
    mockApi({ ...base, roles: ["KITCHEN"], permissions: ["kitchen:orders:read"] });
    renderWith(<HeaderAction />);
    expect(await screen.findByRole("link", { name: "Panel del personal" })).toHaveAttribute(
      "href",
      "/kitchen",
    );
  });
});

describe("administrator offer window", () => {
  it("explains what it is, makes the user an administrator when accepted and shows the home page", async () => {
    const calls = mockApi(base);
    const user = userEvent.setup();
    renderWith(<AdminOfferDialog />);

    expect(
      await screen.findByRole("heading", { name: "¿Quieres ver el panel del personal?" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/web para los clientes/)).toBeInTheDocument();
    expect(screen.getByText(/seguirás como cliente normal/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sí, quiero ser administrador" }));
    await waitFor(() => expect(mocks.router.push).toHaveBeenCalledWith("/"));
    expect(calls).toEqual(["PUT"]);
    // No hay una segunda ventana: la pantalla principal es lo primero que se ve.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("¡Ya eres administrador!")).not.toBeInTheDocument();
    expect(localStorage.getItem(`forno-admin-offer-v1:${base.id}`)).toBe("yes");
  });

  it("remembers a refusal and does not ask again", async () => {
    const calls = mockApi(base);
    const user = userEvent.setup();
    const first = renderWith(<AdminOfferDialog />);
    await user.click(await screen.findByRole("button", { name: "Solo como cliente" }));
    expect(calls).toEqual([]);
    expect(mocks.router.push).toHaveBeenCalledWith("/");
    expect(localStorage.getItem(`forno-admin-offer-v1:${base.id}`)).toBe("no");
    first.unmount();

    renderWith(<AdminOfferDialog />);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("heading", { name: /panel del personal/ })).not.toBeInTheDocument();
  });

  it("does not appear for existing staff, incomplete profiles or when the server disables it", async () => {
    for (const profile of [
      admin,
      { ...base, profileComplete: false },
      { ...base, selfAdminAvailable: false },
    ]) {
      mockApi(profile);
      const view = renderWith(<AdminOfferDialog />);
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      view.unmount();
    }
  });
});

describe("account button", () => {
  it("toggles between «Hazte administrador» and «Dejar de ser administrador»", async () => {
    const calls = mockApi(base);
    const user = userEvent.setup();
    renderWith(<AdminRoleButton />);

    await user.click(await screen.findByRole("button", { name: "Hazte administrador" }));
    const leave = await screen.findByRole("button", { name: "Dejar de ser administrador" });
    await user.click(leave);
    expect(await screen.findByRole("button", { name: "Hazte administrador" })).toBeInTheDocument();
    expect(calls).toEqual(["PUT", "DELETE"]);
  });

  it("is hidden when the server does not offer it", async () => {
    mockApi({ ...base, selfAdminAvailable: false });
    renderWith(<AdminRoleButton />);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("explains a refusal from the server", async () => {
    mockApi(base, () =>
      Response.json({ error: { code: "SELF_ADMIN_DISABLED", message: "x" } }, { status: 403 }),
    );
    const user = userEvent.setup();
    renderWith(<AdminRoleButton />);
    await user.click(await screen.findByRole("button", { name: "Hazte administrador" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/no está disponible en este entorno/),
    );
  });
});
