import { describe, expect, it } from "vitest";

import { authErrorMessage, GENERIC_AUTH_ERROR, NETWORK_ERROR } from "@/features/auth/messages";

describe("authErrorMessage", () => {
  it("translates the known Supabase error codes to Spanish", () => {
    expect(authErrorMessage({ code: "invalid_credentials" })).toBe(
      "El correo o la contraseña no son correctos.",
    );
    expect(authErrorMessage({ code: "email_not_confirmed" })).toMatch(/confirmado tu correo/);
    expect(authErrorMessage({ code: "user_already_exists" })).toMatch(/Ya existe una cuenta/);
    expect(authErrorMessage({ code: "weak_password" })).toMatch(/demasiado débil/);
    expect(authErrorMessage({ code: "otp_expired" })).toMatch(/caducado/);
    expect(authErrorMessage({ code: "over_email_send_rate_limit" })).toMatch(/demasiados correos/);
  });

  it("recognizes connection and rate limit failures without a code", () => {
    expect(authErrorMessage({ name: "AuthRetryableFetchError", status: 0 })).toBe(NETWORK_ERROR);
    expect(authErrorMessage({ status: 429 })).toMatch(/Demasiados intentos/);
  });

  it("never shows the original English or internal message", () => {
    const message = authErrorMessage({
      code: "unexpected_failure",
      message: "duplicate key value violates unique constraint users_pkey",
    });
    expect(message).toBe(GENERIC_AUTH_ERROR);
    expect(message).not.toMatch(/duplicate|constraint|users_pkey/);
    expect(authErrorMessage(null)).toBe(GENERIC_AUTH_ERROR);
  });
});
