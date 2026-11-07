import { describe, expect, it } from "vitest";

import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "@/features/auth/schemas";
import { profileFormSchema } from "@/features/account/profile";

function messages(result: { success: boolean; error?: { issues: Array<{ message: string }> } }) {
  return result.error?.issues.map((issue) => issue.message) ?? [];
}

const validRegister = {
  fullName: "Ana López",
  email: "ana@example.com",
  password: "Contrasena1",
  confirmPassword: "Contrasena1",
  acceptPrivacy: true,
};

describe("login schema", () => {
  it("accepts a correct email and any non-empty password", () => {
    expect(loginSchema.safeParse({ email: " ana@example.com ", password: "x" }).success).toBe(true);
  });

  it("explains what is missing", () => {
    const result = loginSchema.safeParse({ email: "", password: "" });
    expect(messages(result)).toEqual([
      "Introduce tu correo electrónico",
      "Introduce tu contraseña",
    ]);
    expect(messages(loginSchema.safeParse({ email: "no-es-un-correo", password: "x" }))).toEqual([
      "Introduce un correo electrónico válido",
    ]);
  });
});

describe("register schema", () => {
  it("accepts valid data", () => {
    expect(registerSchema.safeParse(validRegister).success).toBe(true);
  });

  it("requires a strong enough password (8+ characters, a letter and a number)", () => {
    const tryPassword = (password: string) =>
      messages(registerSchema.safeParse({ ...validRegister, password, confirmPassword: password }));

    expect(tryPassword("corta1")).toContain("La contraseña debe tener al menos 8 caracteres");
    expect(tryPassword("12345678")).toContain("La contraseña debe incluir al menos una letra");
    expect(tryPassword("soloLetras")).toContain("La contraseña debe incluir al menos un número");
    expect(tryPassword("x".repeat(73) + "1")).toContain(
      "La contraseña no puede superar los 72 caracteres",
    );
    expect(tryPassword("Valida123")).toEqual([]);
  });

  it("requires both passwords to match, on the confirmation field", () => {
    const result = registerSchema.safeParse({ ...validRegister, confirmPassword: "Otra1234" });
    expect(result.error?.issues).toMatchObject([
      { path: ["confirmPassword"], message: "Las contraseñas no coinciden" },
    ]);
  });

  it("requires the privacy policy to be accepted", () => {
    const result = registerSchema.safeParse({ ...validRegister, acceptPrivacy: false });
    expect(result.error?.issues[0]).toMatchObject({ path: ["acceptPrivacy"] });
  });

  it("requires a name", () => {
    expect(messages(registerSchema.safeParse({ ...validRegister, fullName: "   " }))).toEqual([
      "Introduce tu nombre",
    ]);
  });
});

describe("password recovery schemas", () => {
  it("validates the email to send the link to", () => {
    expect(forgotPasswordSchema.safeParse({ email: "ana@example.com" }).success).toBe(true);
    expect(forgotPasswordSchema.safeParse({ email: "ana" }).success).toBe(false);
  });

  it("applies the same rules to the new password", () => {
    expect(
      resetPasswordSchema.safeParse({ password: "Nueva1234", confirmPassword: "Nueva1234" })
        .success,
    ).toBe(true);
    expect(
      resetPasswordSchema.safeParse({ password: "corta", confirmPassword: "corta" }).success,
    ).toBe(false);
    expect(
      resetPasswordSchema.safeParse({ password: "Nueva1234", confirmPassword: "Distinta1" })
        .success,
    ).toBe(false);
  });
});

describe("profile form schema", () => {
  const valid = {
    fullName: "Ana López",
    username: "ana_lopez",
    phone: "+34 600 000 000",
    marketingConsent: false,
  };

  it("accepts valid data", () => {
    expect(profileFormSchema.safeParse(valid).success).toBe(true);
    expect(profileFormSchema.safeParse({ ...valid, username: "WWWWWWWWWWWW" }).success).toBe(true);
  });

  it("requires the phone (it is not optional)", () => {
    expect(messages(profileFormSchema.safeParse({ ...valid, phone: "" }))[0]).toBe(
      "Introduce tu teléfono",
    );
    expect(profileFormSchema.safeParse({ ...valid, phone: "abc" }).success).toBe(false);
  });

  it("limits the username to what fits the header button", () => {
    expect(profileFormSchema.safeParse({ ...valid, username: "ab" }).success).toBe(false);
    expect(profileFormSchema.safeParse({ ...valid, username: "a".repeat(13) }).success).toBe(false);
    expect(profileFormSchema.safeParse({ ...valid, username: "ana lopez" }).success).toBe(false);
    expect(profileFormSchema.safeParse({ ...valid, username: "" }).success).toBe(false);
  });

  it("rejects an empty name", () => {
    expect(profileFormSchema.safeParse({ ...valid, fullName: " " }).success).toBe(false);
  });
});
