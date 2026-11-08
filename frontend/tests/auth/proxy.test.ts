// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const updateSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/update-session", () => ({ updateSession }));

import { config, proxy } from "@/proxy";
import { NextResponse } from "next/server";

function request(path: string) {
  return new NextRequest(new URL(path, "http://localhost:3000"));
}

beforeEach(() => {
  updateSession.mockReset();
});

describe("proxy (route protection)", () => {
  it("redirects visitors without a session from private areas to the login page", async () => {
    updateSession.mockResolvedValue({ response: NextResponse.next(), authenticated: false });

    for (const path of ["/cuenta", "/admin", "/admin/productos", "/kitchen"]) {
      const response = await proxy(request(path));
      expect(response.status, path).toBe(307);
      expect(response.headers.get("location")).toBe(
        `http://localhost:3000/acceso?next=${encodeURIComponent(path)}`,
      );
    }
  });

  it("keeps the query string in the destination to return to", async () => {
    updateSession.mockResolvedValue({ response: NextResponse.next(), authenticated: false });
    const response = await proxy(request("/cuenta?tab=pedidos"));
    expect(response.headers.get("location")).toContain(encodeURIComponent("/cuenta?tab=pedidos"));
  });

  it("lets signed-in users through", async () => {
    const next = NextResponse.next();
    updateSession.mockResolvedValue({ response: next, authenticated: true });
    expect(await proxy(request("/cuenta"))).toBe(next);
  });

  it("does not redirect public pages", async () => {
    const next = NextResponse.next();
    updateSession.mockResolvedValue({ response: next, authenticated: false });
    expect(await proxy(request("/carta"))).toBe(next);
  });

  it("carries over the cookies refreshed or cleared while checking the session", async () => {
    const withCookie = NextResponse.next();
    withCookie.cookies.set("sb-test-auth-token", "", { maxAge: 0 });
    updateSession.mockResolvedValue({ response: withCookie, authenticated: false });

    const response = await proxy(request("/cuenta"));
    expect(response.headers.get("set-cookie")).toContain("sb-test-auth-token");
  });

  it("only runs on the private areas", () => {
    expect(config.matcher).toEqual([
      "/cuenta/:path*",
      "/pedido/:path*",
      "/admin/:path*",
      "/kitchen/:path*",
    ]);
  });
});
