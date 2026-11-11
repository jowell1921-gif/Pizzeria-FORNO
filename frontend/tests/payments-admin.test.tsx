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
  usePathname: () => "/admin",
}));

import { ProfileProvider } from "@/features/account/profile-context";
import { NotificationsView } from "@/features/admin/notifications-view";
import { RefundForm } from "@/features/panel/payment-admin";

const profile = (permissions: string[]) => ({
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

const paid = {
  method: "ONLINE" as const,
  status: "PAID",
  amount: "19.00",
  refundedAmount: "0.00",
  failureReason: null,
  paidAt: "2026-11-10T11:00:00.000Z",
};

function mockApi(permissions: string[], extra: Record<string, () => Response> = {}) {
  const calls: Array<{ key: string; body?: Record<string, unknown> }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL | string, init: RequestInit = {}) => {
      const path = new URL(String(url)).pathname.replace("/api/v1", "");
      const key = `${init.method ?? "GET"} ${path}`;
      calls.push({
        key,
        ...(typeof init.body === "string" ? { body: JSON.parse(init.body) } : {}),
      });
      if (extra[key]) return extra[key]!();
      if (path === "/me") return Response.json({ data: profile(permissions) });
      return Response.json({ data: [] });
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

describe("refund form", () => {
  it("is hidden without the payments:refund permission and for unpaid or cash payments", async () => {
    mockApi(["orders:read:all"]);
    const first = wrap(<RefundForm orderId="o1" payments={[paid]} onDone={vi.fn()} />);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("button", { name: "Reembolsar" })).not.toBeInTheDocument();
    first.unmount();

    mockApi(["payments:refund"]);
    wrap(
      <RefundForm
        orderId="o1"
        payments={[
          { ...paid, status: "PENDING" },
          { ...paid, method: "CASH_PICKUP", status: "CASH_COLLECTED" },
        ]}
        onDone={vi.fn()}
      />,
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("button", { name: "Reembolsar" })).not.toBeInTheDocument();
  });

  it("requires a reason, shows what can be refunded and sends a partial amount", async () => {
    const calls = mockApi(["payments:refund"], {
      "POST /admin/orders/o1/refund": () => Response.json({ data: {} }),
    });
    const onDone = vi.fn();
    const user = userEvent.setup();
    wrap(
      <RefundForm orderId="o1" payments={[{ ...paid, refundedAmount: "4.00" }]} onDone={onDone} />,
    );

    await user.click(await screen.findByRole("button", { name: "Reembolsar" }));
    const form = screen.getByRole("form", { name: "Reembolsar el pago" });
    expect(within(form).getByText(/15\.00 €/)).toBeInTheDocument();
    const confirm = within(form).getByRole("button", { name: "Confirmar reembolso" });
    expect(confirm).toBeDisabled();

    await user.type(within(form).getByLabelText(/Importe/), "5.00");
    await user.type(within(form).getByLabelText(/Motivo/), "Pizza fría");
    await user.click(confirm);
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(calls.find((call) => call.key === "POST /admin/orders/o1/refund")?.body).toEqual({
      amount: "5.00",
      reason: "Pizza fría",
    });
  });

  it("explains a refusal in Spanish", async () => {
    mockApi(["payments:refund"], {
      "POST /admin/orders/o1/refund": () =>
        Response.json({ error: { code: "INVALID_REFUND_AMOUNT", message: "x" } }, { status: 422 }),
    });
    const user = userEvent.setup();
    wrap(<RefundForm orderId="o1" payments={[paid]} onDone={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Reembolsar" }));
    await user.type(screen.getByLabelText(/Motivo/), "Prueba");
    await user.click(screen.getByRole("button", { name: "Confirmar reembolso" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/supera lo que se puede devolver/);
  });
});

describe("notifications screen", () => {
  it("shows what was sent and what was only registered, with the readable content", async () => {
    mockApi(["settings:manage"], {
      "GET /admin/notifications": () =>
        Response.json({
          data: [
            {
              id: "n1",
              template: "ORDER_CONFIRMED",
              recipient: "ana@example.com",
              subject: "Hemos recibido tu pedido #7",
              body: "Hola Ana, hemos recibido tu pedido #7.",
              status: "LOGGED",
              attempts: 1,
              lastError: null,
              orderNumber: 7,
              createdAt: "2026-11-10T11:00:00.000Z",
              sentAt: null,
            },
            {
              id: "n2",
              template: "ORDER_READY",
              recipient: "luis@example.com",
              subject: "Tu pedido #8 está listo para recoger",
              body: "Listo.",
              status: "FAILED",
              attempts: 5,
              lastError: "Resend responded 403",
              orderNumber: 8,
              createdAt: "2026-11-10T11:05:00.000Z",
              sentAt: null,
            },
          ],
          meta: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
        }),
    });
    wrap(<NotificationsView />);
    const list = await screen.findByRole("list", { name: "Correos" });
    expect(within(list).getByText("Registrado (no enviado)")).toBeInTheDocument();
    expect(within(list).getByText("Fallido")).toBeInTheDocument();
    expect(within(list).getByText(/Intento 5: Resend responded 403/)).toBeInTheDocument();
    expect(within(list).getByText(/Hola Ana, hemos recibido tu pedido #7\./)).toBeInTheDocument();
  });
});
