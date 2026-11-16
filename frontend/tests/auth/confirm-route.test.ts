import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ verifyOtp: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { verifyOtp: mocks.verifyOtp } }),
}));

import { GET, POST } from "@/app/auth/confirm/route";
import { isOtpType } from "@/features/auth/confirm-link";

const ORIGIN = "https://forneapizzeria.es";

function post(fields: Record<string, string | undefined>) {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) if (value !== undefined) body.set(key, value);
  return new NextRequest(`${ORIGIN}/auth/confirm`, { method: "POST", body });
}

const location = (response: Response) => new URL(response.headers.get("location") ?? "");

beforeEach(() => {
  mocks.verifyOtp.mockReset();
  mocks.verifyOtp.mockResolvedValue({ error: null });
});

describe("email link (GET /auth/confirm)", () => {
  it("only sends the visitor to the confirmation page and never spends the one-time code", () => {
    const response = GET(
      new NextRequest(`${ORIGIN}/auth/confirm?token_hash=abc&type=signup&next=/cuenta`),
    );
    const target = location(response);
    expect(target.pathname).toBe("/confirmar-correo");
    expect(Object.fromEntries(target.searchParams)).toEqual({
      token_hash: "abc",
      type: "signup",
      next: "/cuenta",
    });
    // Un robot que abra el enlace (analizador del correo, antivirus) no gasta el código.
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it("rejects a missing token or an unknown type", () => {
    for (const query of ["", "?type=signup", "?token_hash=abc", "?token_hash=abc&type=hack"]) {
      const response = GET(new NextRequest(`${ORIGIN}/auth/confirm${query}`));
      expect(location(response).pathname + location(response).search).toBe("/acceso?error=confirm");
    }
  });

  it("drops an external destination", () => {
    const response = GET(
      new NextRequest(`${ORIGIN}/auth/confirm?token_hash=abc&type=recovery&next=//evil.example`),
    );
    expect(location(response).searchParams.get("next")).toBe("/cuenta");
  });
});

describe("confirmation button (POST /auth/confirm)", () => {
  it("spends the code once and sends the person on, with a 303", async () => {
    const response = await POST(post({ token_hash: "abc", type: "signup", next: "/cuenta" }));
    expect(mocks.verifyOtp).toHaveBeenCalledTimes(1);
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ type: "signup", token_hash: "abc" });
    expect(response.status).toBe(303);
    expect(location(response).pathname).toBe("/cuenta");
  });

  it("goes to the login with an error when the code is used or expired", async () => {
    mocks.verifyOtp.mockResolvedValue({ error: { message: "used" } });
    const response = await POST(post({ token_hash: "abc", type: "signup", next: "/cuenta" }));
    expect(response.status).toBe(303);
    expect(location(response).pathname + location(response).search).toBe("/acceso?error=confirm");
  });

  it("does not call Supabase for a missing token or an unknown type", async () => {
    for (const fields of [{ type: "signup" }, { token_hash: "abc", type: "hack" }, {}]) {
      const response = await POST(post(fields));
      expect(location(response).pathname).toBe("/acceso");
    }
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it("never redirects to another site", async () => {
    const response = await POST(
      post({ token_hash: "abc", type: "recovery", next: "https://evil.example" }),
    );
    expect(location(response).origin).toBe(ORIGIN);
  });
});

describe("isOtpType", () => {
  it("accepts the Supabase link types and nothing else", () => {
    for (const ok of ["signup", "recovery", "magiclink", "email_change", "invite", "email"]) {
      expect(isOtpType(ok)).toBe(true);
    }
    for (const bad of ["hack", "", null, undefined, "SIGNUP"]) expect(isOtpType(bad)).toBe(false);
  });
});
