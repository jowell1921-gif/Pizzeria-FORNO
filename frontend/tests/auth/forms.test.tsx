import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  client: null as unknown,
  session: null as unknown,
  router: { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() },
  auth: {
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    updateUser: vi.fn(),
    signInWithOAuth: vi.fn(),
    signOut: vi.fn(),
    onAuthStateChange: vi.fn(),
  },
}));

vi.mock("@/lib/supabase/client", () => ({ createClient: () => mocks.client }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router, usePathname: () => "/" }));

import { ForgotPasswordForm } from "@/features/auth/forgot-password-form";
import { GoogleButton } from "@/features/auth/google-button";
import { LoginForm } from "@/features/auth/login-form";
import { RegisterForm } from "@/features/auth/register-form";
import { ResetPasswordForm } from "@/features/auth/reset-password-form";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.client = { auth: mocks.auth };
  mocks.session = null;
  mocks.auth.onAuthStateChange.mockImplementation((callback: (e: string, s: unknown) => void) => {
    callback("INITIAL_SESSION", mocks.session);
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
});

describe("LoginForm", () => {
  it("shows validation messages without calling Supabase", async () => {
    const user = userEvent.setup();
    render(<LoginForm next="/cuenta" />);

    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    expect(await screen.findByText("Introduce tu correo electrónico")).toBeInTheDocument();
    expect(screen.getByText("Introduce tu contraseña")).toBeInTheDocument();
    expect(mocks.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("marks invalid fields for assistive technology and links their errors", async () => {
    const user = userEvent.setup();
    render(<LoginForm next="/cuenta" />);
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    const email = await screen.findByLabelText("Correo electrónico");
    expect(email).toHaveAttribute("aria-invalid", "true");
    const describedBy = email.getAttribute("aria-describedby")!;
    expect(document.getElementById(describedBy)).toHaveTextContent(
      "Introduce tu correo electrónico",
    );
  });

  it("signs in with the typed credentials and goes to the safe destination", async () => {
    mocks.auth.signInWithPassword.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(<LoginForm next="/carta" />);

    await user.type(screen.getByLabelText("Correo electrónico"), "ana@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "Contrasena1");
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith("/carta"));
    expect(mocks.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "ana@example.com",
      password: "Contrasena1",
    });
    expect(mocks.router.refresh).toHaveBeenCalled();
  });

  it("never navigates to an external destination, even if one is passed", async () => {
    mocks.auth.signInWithPassword.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(<LoginForm next="https://evil.example/steal" />);

    await user.type(screen.getByLabelText("Correo electrónico"), "ana@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "x");
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith("/cuenta"));
  });

  it("shows a translated error and does not navigate when the credentials are wrong", async () => {
    mocks.auth.signInWithPassword.mockResolvedValue({
      error: { code: "invalid_credentials", message: "Invalid login credentials" },
    });
    const user = userEvent.setup();
    render(<LoginForm next="/cuenta" />);

    await user.type(screen.getByLabelText("Correo electrónico"), "ana@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "mala");
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El correo o la contraseña no son correctos.",
    );
    expect(screen.queryByText(/Invalid login credentials/)).not.toBeInTheDocument();
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });

  it("explains that access is not configured when Supabase is missing", async () => {
    mocks.client = null;
    const user = userEvent.setup();
    render(<LoginForm next="/cuenta" />);

    await user.type(screen.getByLabelText("Correo electrónico"), "ana@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "x");
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/no está configurado/);
  });

  it("links to password recovery", () => {
    render(<LoginForm next="/cuenta" />);
    expect(screen.getByRole("link", { name: "¿Has olvidado tu contraseña?" })).toHaveAttribute(
      "href",
      "/recuperar-contrasena",
    );
  });
});

describe("RegisterForm", () => {
  async function fillValid(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText("Nombre completo"), "Ana López");
    await user.type(screen.getByLabelText("Correo electrónico"), "ana@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "Contrasena1");
    await user.type(screen.getByLabelText("Repite la contraseña"), "Contrasena1");
    await user.click(screen.getByRole("checkbox"));
  }

  it("requires accepting the privacy policy and matching passwords", async () => {
    const user = userEvent.setup();
    render(<RegisterForm next="/cuenta" />);

    await user.type(screen.getByLabelText("Nombre completo"), "Ana");
    await user.type(screen.getByLabelText("Correo electrónico"), "ana@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "Contrasena1");
    await user.type(screen.getByLabelText("Repite la contraseña"), "Otra12345");
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));

    expect(await screen.findByText("Las contraseñas no coinciden")).toBeInTheDocument();
    expect(
      screen.getByText("Debes aceptar la política de privacidad para crear la cuenta"),
    ).toBeInTheDocument();
    expect(mocks.auth.signUp).not.toHaveBeenCalled();
  });

  it("creates the account with the name as user metadata and asks the user to confirm the email", async () => {
    mocks.auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
    const user = userEvent.setup();
    render(<RegisterForm next="/carta" />);

    await fillValid(user);
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));

    await waitFor(() => expect(mocks.auth.signUp).toHaveBeenCalledTimes(1));
    const arg = mocks.auth.signUp.mock.calls[0]![0] as {
      email: string;
      password: string;
      options: { data: unknown; emailRedirectTo: string };
    };
    expect(arg.email).toBe("ana@example.com");
    expect(arg.password).toBe("Contrasena1");
    expect(arg.options.data).toEqual({ full_name: "Ana López" });
    expect(arg.options.emailRedirectTo).toBe(
      `${window.location.origin}/auth/callback?next=${encodeURIComponent("/carta")}`,
    );

    expect(await screen.findByText("Revisa tu correo")).toBeInTheDocument();
    expect(screen.getByText("ana@example.com")).toBeInTheDocument();
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });

  it("goes straight to the destination when Supabase returns a session (email confirmation off)", async () => {
    mocks.auth.signUp.mockResolvedValue({ data: { session: { access_token: "t" } }, error: null });
    const user = userEvent.setup();
    render(<RegisterForm next="/carta" />);

    await fillValid(user);
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));

    await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith("/carta"));
  });

  it("shows a translated error when the email already exists", async () => {
    mocks.auth.signUp.mockResolvedValue({
      data: { session: null },
      error: { code: "user_already_exists", message: "User already registered" },
    });
    const user = userEvent.setup();
    render(<RegisterForm next="/cuenta" />);

    await fillValid(user);
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Ya existe una cuenta/);
  });

  it("links to the privacy policy", () => {
    render(<RegisterForm next="/cuenta" />);
    expect(screen.getByRole("link", { name: "política de privacidad" })).toHaveAttribute(
      "href",
      "/legal/privacidad",
    );
  });
});

describe("ForgotPasswordForm", () => {
  it("asks Supabase for the recovery link pointing back to the callback", async () => {
    mocks.auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText("Correo electrónico"), "ana@example.com");
    await user.click(screen.getByRole("button", { name: "Enviar enlace" }));

    await waitFor(() => expect(mocks.auth.resetPasswordForEmail).toHaveBeenCalled());
    expect(mocks.auth.resetPasswordForEmail).toHaveBeenCalledWith("ana@example.com", {
      redirectTo: `${window.location.origin}/auth/callback?next=/restablecer-contrasena`,
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      /Si ana@example.com tiene una cuenta/,
    );
  });

  it("shows the same confirmation whether or not the account exists (no user enumeration)", async () => {
    mocks.auth.resetPasswordForEmail.mockResolvedValue({
      error: { code: "user_not_found", message: "User not found", status: 400 },
    });
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText("Correo electrónico"), "nadie@example.com");
    await user.click(screen.getByRole("button", { name: "Enviar enlace" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      /Si nadie@example.com tiene una cuenta/,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does report rate limiting, which reveals nothing about the account", async () => {
    mocks.auth.resetPasswordForEmail.mockResolvedValue({
      error: { code: "over_email_send_rate_limit", status: 429 },
    });
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText("Correo electrónico"), "ana@example.com");
    await user.click(screen.getByRole("button", { name: "Enviar enlace" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/demasiados correos/);
  });

  it("validates the email format", async () => {
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);
    await user.type(screen.getByLabelText("Correo electrónico"), "no-es-un-correo");
    await user.click(screen.getByRole("button", { name: "Enviar enlace" }));

    expect(await screen.findByText("Introduce un correo electrónico válido")).toBeInTheDocument();
    expect(mocks.auth.resetPasswordForEmail).not.toHaveBeenCalled();
  });
});

describe("ResetPasswordForm", () => {
  it("rejects visitors without the session created by the email link", () => {
    mocks.session = null;
    render(<ResetPasswordForm />);
    expect(screen.getByRole("alert")).toHaveTextContent("El enlace no es válido o ha caducado.");
    expect(screen.getByRole("link", { name: "Solicitar un enlace nuevo" })).toHaveAttribute(
      "href",
      "/recuperar-contrasena",
    );
    expect(screen.queryByLabelText("Nueva contraseña")).not.toBeInTheDocument();
  });

  it("updates the password when there is a recovery session", async () => {
    mocks.session = { access_token: "recovery-token" };
    mocks.auth.updateUser.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(<ResetPasswordForm />);

    await user.type(screen.getByLabelText("Nueva contraseña"), "Nueva12345");
    await user.type(screen.getByLabelText("Repite la nueva contraseña"), "Nueva12345");
    await user.click(screen.getByRole("button", { name: "Guardar contraseña" }));

    await waitFor(() =>
      expect(mocks.auth.updateUser).toHaveBeenCalledWith({ password: "Nueva12345" }),
    );
    expect(await screen.findByText("Contraseña actualizada")).toBeInTheDocument();
  });

  it("applies the password rules and shows API errors", async () => {
    mocks.session = { access_token: "recovery-token" };
    mocks.auth.updateUser.mockResolvedValue({ error: { code: "same_password" } });
    const user = userEvent.setup();
    render(<ResetPasswordForm />);

    await user.type(screen.getByLabelText("Nueva contraseña"), "corta");
    await user.type(screen.getByLabelText("Repite la nueva contraseña"), "corta");
    await user.click(screen.getByRole("button", { name: "Guardar contraseña" }));
    expect(
      await screen.findByText("La contraseña debe tener al menos 8 caracteres"),
    ).toBeInTheDocument();
    expect(mocks.auth.updateUser).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText("Nueva contraseña"));
    await user.clear(screen.getByLabelText("Repite la nueva contraseña"));
    await user.type(screen.getByLabelText("Nueva contraseña"), "Nueva12345");
    await user.type(screen.getByLabelText("Repite la nueva contraseña"), "Nueva12345");
    await user.click(screen.getByRole("button", { name: "Guardar contraseña" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/distinta de la anterior/);
  });
});

describe("GoogleButton", () => {
  it("starts the Google OAuth flow and returns to the callback with a safe destination", async () => {
    mocks.auth.signInWithOAuth.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(<GoogleButton next="/carta" />);

    await user.click(screen.getByRole("button", { name: "Continuar con Google" }));

    expect(mocks.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/carta")}`,
      },
    });
  });

  it("sanitizes an external destination before sending it to Supabase", async () => {
    mocks.auth.signInWithOAuth.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(<GoogleButton next="//evil.example" />);
    await user.click(screen.getByRole("button", { name: "Continuar con Google" }));

    const arg = mocks.auth.signInWithOAuth.mock.calls[0]![0] as { options: { redirectTo: string } };
    expect(arg.options.redirectTo).toBe(
      `${window.location.origin}/auth/callback?next=${encodeURIComponent("/cuenta")}`,
    );
  });

  it("shows an error when the provider is not available", async () => {
    mocks.auth.signInWithOAuth.mockResolvedValue({ error: { code: "provider_disabled" } });
    const user = userEvent.setup();
    render(<GoogleButton next="/cuenta" />);
    await user.click(screen.getByRole("button", { name: "Continuar con Google" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/no está disponible todavía/);
  });

  it("explains that access is not configured when Supabase is missing", async () => {
    mocks.client = null;
    const user = userEvent.setup();
    render(<GoogleButton next="/cuenta" />);
    await user.click(screen.getByRole("button", { name: "Continuar con Google" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/no está configurado/);
  });
});
