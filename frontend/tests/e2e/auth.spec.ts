import { expect, test, type Page } from "@playwright/test";

/**
 * Pruebas de interfaz y de protección de rutas SIN claves de Supabase (ver playwright.config.ts).
 * Los flujos reales de correo y de Google se verifican con un proyecto de Supabase configurado.
 */

/** Alerta de un formulario (excluye el anunciador de rutas de Next.js, que también usa role=alert). */
const formAlert = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');

const usesMenuButton = (page: Page) => (page.viewportSize()?.width ?? 0) < 1024;

test.describe("route protection", () => {
  for (const path of [
    "/cuenta",
    "/admin",
    "/admin/pedidos",
    "/admin/carta",
    "/admin/promociones",
    "/admin/club",
    "/admin/establecimiento",
    "/admin/auditoria",
    "/admin/correos",
    "/kitchen",
  ]) {
    test(`${path} redirects visitors without a session to the login page`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/acceso\\?next=${encodeURIComponent(path)}$`));
      await expect(page.getByRole("heading", { level: 1, name: "Acceder" })).toBeVisible();
    });
  }

  test("public pages are not redirected", async ({ page }) => {
    for (const path of ["/", "/carta", "/promociones", "/forno-club"]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      await expect(page).toHaveURL(new RegExp(`${path === "/" ? "/$" : path + "$"}`));
    }
  });
});

test.describe("authentication pages", () => {
  test("warn that access is not configured but keep the site usable", async ({ page }) => {
    await page.goto("/acceso");
    await expect(page.getByTestId("auth-not-configured")).toContainText(
      "Acceso de usuarios no configurado",
    );
    await expect(page.getByRole("button", { name: "Continuar con Google" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Iniciar sesión" })).toBeVisible();
  });

  test("the login form validates before sending anything", async ({ page }) => {
    await page.goto("/acceso");
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await expect(page.getByText("Introduce tu correo electrónico")).toBeVisible();
    await expect(page.getByText("Introduce tu contraseña")).toBeVisible();

    await page.getByLabel("Correo electrónico").fill("no-es-un-correo");
    await page.getByLabel("Contraseña").fill("x");
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await expect(page.getByText("Introduce un correo electrónico válido")).toBeVisible();
  });

  test("a valid login says that access is not configured instead of failing silently", async ({
    page,
  }) => {
    await page.goto("/acceso");
    await page.getByLabel("Correo electrónico").fill("ana@example.com");
    await page.getByLabel("Contraseña").fill("Contrasena1");
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await expect(formAlert(page)).toContainText("no está configurado");
  });

  test("the registration form checks the password rules, the match and the privacy policy", async ({
    page,
  }) => {
    await page.goto("/registro");
    await page.getByLabel("Nombre completo").fill("Ana López");
    await page.getByLabel("Correo electrónico").fill("ana@example.com");
    await page.getByLabel("Contraseña", { exact: true }).fill("corta");
    await page.getByLabel("Repite la contraseña").fill("otra");
    await page.getByRole("button", { name: "Crear cuenta" }).click();

    await expect(page.getByText("La contraseña debe tener al menos 8 caracteres")).toBeVisible();
    await expect(page.getByText("Las contraseñas no coinciden")).toBeVisible();
    await expect(
      page.getByText("Debes aceptar la política de privacidad para crear la cuenta"),
    ).toBeVisible();
  });

  test("the privacy policy link opens the legal page", async ({ page }) => {
    await page.goto("/registro");
    await page.getByRole("main").getByRole("link", { name: "política de privacidad" }).click();
    await expect(page).toHaveURL(/\/legal\/privacidad$/);
  });

  test("the password recovery form validates the email", async ({ page }) => {
    await page.goto("/recuperar-contrasena");
    await page.getByLabel("Correo electrónico").fill("no-es-un-correo");
    await page.getByRole("button", { name: "Enviar enlace" }).click();
    await expect(page.getByText("Introduce un correo electrónico válido")).toBeVisible();
  });

  test("the reset page rejects visitors that did not come from the email link", async ({
    page,
  }) => {
    await page.goto("/restablecer-contrasena");
    await expect(formAlert(page)).toContainText("El enlace no es válido o ha caducado.");
    await expect(page.getByRole("link", { name: "Solicitar un enlace nuevo" })).toBeVisible();
    await expect(page.getByLabel("Nueva contraseña")).toHaveCount(0);
  });

  test("login and registration link to each other and keep the destination", async ({ page }) => {
    await page.goto("/acceso?next=/carta");
    await page.getByRole("link", { name: "Crear cuenta" }).click();
    await expect(page).toHaveURL(/\/registro\?next=%2Fcarta$/);
    await page.getByRole("link", { name: "Iniciar sesión" }).click();
    await expect(page).toHaveURL(/\/acceso\?next=%2Fcarta$/);
  });

  test("an external destination in the URL is ignored", async ({ page }) => {
    await page.goto("/acceso?next=https://evil.example");
    await page.getByRole("link", { name: "Crear cuenta" }).click();
    // Con un destino externo se descarta y se vuelve al valor por defecto.
    await expect(page).toHaveURL(/\/registro\?next=%2Fcuenta$/);
  });

  test("callbacks without a valid code or token send the user back to the login with an error", async ({
    page,
  }) => {
    await page.goto("/auth/callback?code=abc&next=//evil.example");
    await expect(page).toHaveURL(/\/acceso\?error=callback$/);
    await expect(formAlert(page)).toContainText("No hemos podido completar el acceso");

    await page.goto("/auth/confirm?token_hash=abc&type=recovery");
    await expect(page).toHaveURL(/\/acceso\?error=confirm$/);
    await expect(formAlert(page)).toContainText("El enlace de confirmación no es válido");

    // Un tipo de enlace desconocido tampoco se acepta.
    await page.goto("/auth/confirm?token_hash=abc&type=hack");
    await expect(page).toHaveURL(/\/acceso\?error=confirm$/);
  });

  test("the pages are not indexed by search engines", async ({ page }) => {
    for (const path of [
      "/acceso",
      "/registro",
      "/recuperar-contrasena",
      "/restablecer-contrasena",
    ]) {
      await page.goto(path);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    }
  });
});

test.describe("header access link", () => {
  test("«Acceder» is available in the header and opens the login page", async ({ page }) => {
    await page.goto("/");
    if (usesMenuButton(page)) {
      await page.getByRole("button", { name: "Abrir menú" }).click();
      await page.getByRole("dialog").getByRole("link", { name: "Acceder" }).click();
    } else {
      await page.getByRole("banner").getByRole("link", { name: "Acceder" }).click();
    }
    await expect(page).toHaveURL(/\/acceso$/);
    await expect(page.getByRole("heading", { level: 1, name: "Acceder" })).toBeVisible();
  });
});
