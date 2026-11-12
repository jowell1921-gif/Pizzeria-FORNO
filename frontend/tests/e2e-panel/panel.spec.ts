import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * El panel, la cocina y «Mi cuenta» con sesión, en móvil (320 y 390), tablet y escritorio:
 * contenido correcto por rol, sin desbordamientos horizontales, sin errores de consola y sin
 * violaciones de accesibilidad WCAG 2.2 AA. Ver playwright.panel.config.ts.
 */
const AUTH = "http://localhost:4300";
const API = "http://localhost:4200/api/v1";

const USERS = {
  admin: { id: "a0000000-0000-4000-8000-000000000001", email: "admin@e2e.test" },
  staff: { id: "a0000000-0000-4000-8000-000000000002", email: "staff@e2e.test" },
  kitchen: { id: "a0000000-0000-4000-8000-000000000003", email: "kitchen@e2e.test" },
  customer: { id: "a0000000-0000-4000-8000-000000000004", email: "cliente@e2e.test" },
  viewer: { id: "a0000000-0000-4000-8000-000000000005", email: "viewer@e2e.test" },
} as const;

type Role = keyof typeof USERS;

async function tokenFor(role: Role): Promise<string> {
  const { id, email } = USERS[role];
  const response = await fetch(`${AUTH}/__token?sub=${id}&email=${encodeURIComponent(email)}`);
  return response.text();
}

/** Inicia sesión como lo haría Supabase: con la cookie de sesión que lee la web (@supabase/ssr). */
async function signIn(context: BrowserContext, role: Role) {
  const accessToken = await tokenFor(role);
  const { id, email } = USERS[role];
  const session = {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: 28_800,
    expires_at: Math.floor(Date.now() / 1000) + 28_800,
    refresh_token: "e2e-refresh-token",
    user: {
      id,
      aud: "authenticated",
      role: "authenticated",
      email,
      app_metadata: {},
      user_metadata: {},
      created_at: "2026-01-01T00:00:00.000Z",
    },
  };
  await context.addCookies([
    {
      name: "sb-localhost-auth-token",
      value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`,
      domain: "localhost",
      path: "/",
    },
  ]);
  return accessToken;
}

const consoleErrors = (page: Page) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    // Los 4xx que provoca la propia prueba (permisos) no son errores de la web.
    if (message.type() === "error" && !/status of 40[134]/.test(message.text())) {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
};

async function expectNoOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  const wide = await page.evaluate(() => {
    const limit = document.documentElement.clientWidth;
    return Array.from(document.body.querySelectorAll<HTMLElement>("*"))
      .filter(
        (element) => !element.closest("nav") && element.getBoundingClientRect().right > limit + 1,
      )
      .slice(0, 4)
      .map(
        (element) =>
          `${element.tagName.toLowerCase()}[${Math.round(element.getBoundingClientRect().right)}/${limit}] ${(element.textContent ?? "").trim().slice(0, 40)}`,
      );
  });
  expect(
    overflow,
    `horizontal overflow in px; wide elements: ${wide.join(" | ")}`,
  ).toBeLessThanOrEqual(0);

  const offenders = await page.evaluate(() => {
    const limit = document.documentElement.clientWidth;
    return Array.from(document.body.querySelectorAll<HTMLElement>("*"))
      .filter((element) => {
        // Listas con desplazamiento propio y capas decorativas, recortadas a propósito.
        if (
          element.closest("[data-scrollable]") ||
          element.closest("nav") ||
          element.closest("pre") ||
          element.closest('[aria-hidden="true"]') ||
          element.closest("table")
        ) {
          return false;
        }
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.right > limit + 1;
      })
      .slice(0, 5)
      .map(
        (element) => `${element.tagName.toLowerCase()}.${String(element.className).slice(0, 60)}`,
      );
  });
  expect(offenders).toEqual([]);
}

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.slice(0, 3).map((node) => node.target.join(" ")),
    })),
  ).toEqual([]);
}

async function firstOrderId(token: string): Promise<string> {
  const response = await fetch(`${API}/admin/orders?pageSize=1`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return ((await response.json()) as { data: Array<{ id: string }> }).data[0]!.id;
}

const ADMIN_PAGES: Array<{ path: string; heading: string | RegExp }> = [
  { path: "/admin", heading: "Panel de control" },
  { path: "/admin/pedidos", heading: "Pedidos" },
  { path: "/admin/carta", heading: "Carta" },
  { path: "/admin/promociones", heading: "Promociones" },
  { path: "/admin/club", heading: "FORNEA CLUB" },
  { path: "/admin/establecimiento", heading: "Establecimiento" },
  { path: "/admin/correos", heading: "Correos" },
  { path: "/kitchen", heading: "Cocina" },
];

test.describe("administrator", () => {
  for (const { path, heading } of ADMIN_PAGES) {
    test(`${path} renders, fits the screen and is accessible`, async ({ page, context }) => {
      await signIn(context, "admin");
      const errors = consoleErrors(page);
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      // Que haya terminado de cargar datos (no solo el marco).
      await expect(page.getByText("Cargando", { exact: false })).toHaveCount(0, {
        timeout: 15_000,
      });
      await expectNoOverflow(page);
      await expectAccessible(page);
      expect(errors).toEqual([]);
    });
  }

  test("the order detail shows the customer, the items and the valid actions", async ({
    page,
    context,
  }) => {
    const token = await signIn(context, "admin");
    const id = await firstOrderId(token);
    const errors = consoleErrors(page);
    await page.goto(`/admin/pedidos/${id}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Pedido");
    await expect(page.getByText("cliente@e2e.test")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Historial" })).toBeVisible();
    await expectNoOverflow(page);
    await expectAccessible(page);
    expect(errors).toEqual([]);
  });

  test("the product editor opens and fits the screen", async ({ page, context }) => {
    await signIn(context, "admin");
    await page.goto("/admin/carta");
    await page.getByRole("button", { name: "Nuevo producto" }).click();
    await expect(page.getByRole("form", { name: "Editor de producto" })).toBeVisible();
    await page.getByRole("button", { name: "Añadir grupo" }).click();
    await expectNoOverflow(page);
    await expectAccessible(page);
  });

  test("the main menu offers every section", async ({ page, context }) => {
    await signIn(context, "admin");
    await page.goto("/admin");
    const nav = page.getByRole("navigation", { name: "Navegación del panel" });
    for (const name of [
      "Panel",
      "Pedidos",
      "Carta",
      "Promociones",
      "FORNEA CLUB",
      "Establecimiento",
      "Correos",
      "Cocina",
    ]) {
      await expect(nav.getByRole("link", { name, exact: true })).toBeVisible();
    }
  });
});

test.describe("kitchen", () => {
  test("shows the orders by column, without customer data, and fits the screen", async ({
    page,
    context,
  }) => {
    await signIn(context, "kitchen");
    const errors = consoleErrors(page);
    await page.goto("/kitchen");
    await expect(page.getByRole("heading", { level: 1, name: "Cocina" })).toBeVisible();
    for (const column of ["Nuevos", "Aceptados", "En preparación", "Listos", "Completados"]) {
      await expect(page.getByRole("region", { name: column })).toBeVisible();
    }
    await expect(page.getByRole("button", { name: "Entregado al repartidor" })).toBeVisible();
    // La cocina no ve datos del cliente ni importes.
    await expect(page.getByText("cliente@e2e.test")).toHaveCount(0);
    await expect(page.getByText(/\d+,\d{2}\s?€/)).toHaveCount(0);
    await expectNoOverflow(page);
    await expectAccessible(page);
    expect(errors).toEqual([]);
  });

  test("has no access to the administration", async ({ page, context }) => {
    await signIn(context, "kitchen");
    await page.goto("/admin/carta");
    await expect(page.getByRole("heading", { name: "Sin permiso" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Nuevo producto" })).toHaveCount(0);
    const nav = page.getByRole("navigation", { name: "Navegación del panel" });
    await expect(nav.getByRole("link", { name: "Carta", exact: true })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Cocina", exact: true })).toBeVisible();
  });
});

test.describe("staff", () => {
  test("sees orders but not the menu, settings, club or emails", async ({ page, context }) => {
    await signIn(context, "staff");
    await page.goto("/admin/pedidos");
    await expect(page.getByRole("heading", { level: 1, name: "Pedidos" })).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Navegación del panel" });
    for (const hidden of ["Carta", "Promociones", "FORNEA CLUB", "Establecimiento", "Correos"]) {
      await expect(nav.getByRole("link", { name: hidden, exact: true })).toHaveCount(0);
    }
    await page.goto("/admin/carta");
    await expect(page.getByRole("heading", { name: "Sin permiso" })).toBeVisible();
    await expectNoOverflow(page);
  });
});

test.describe("administrator who is not the owner", () => {
  const SECTIONS: Array<{ path: string; heading: string; locked: Array<string | RegExp> }> = [
    { path: "/admin/carta", heading: "Carta", locked: ["Nuevo producto"] },
    { path: "/admin/promociones", heading: "Promociones", locked: ["Nueva promoción"] },
    { path: "/admin/club", heading: "FORNEA CLUB", locked: ["Guardar cambios"] },
    {
      path: "/admin/establecimiento",
      heading: "Establecimiento",
      locked: ["Aplicar", "Nueva zona"],
    },
  ];

  for (const { path, heading, locked } of SECTIONS) {
    test(`${path} is read-only: visible, with the editing controls disabled`, async ({
      page,
      context,
    }) => {
      await signIn(context, "viewer");
      const errors = consoleErrors(page);
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      await expect(page.getByText("Modo lectura.")).toBeVisible();
      for (const name of locked) {
        await expect(page.getByRole("button", { name, exact: true })).toBeDisabled();
      }
      await expectNoOverflow(page);
      await expectAccessible(page);
      expect(errors).toEqual([]);
    });
  }

  test("the server also refuses their changes, and the audit is gone from the menu", async ({
    context,
    page,
  }) => {
    const token = await signIn(context, "viewer");
    const response = await fetch(`${API}/admin/categories`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Ensaladas" }),
    });
    expect(response.status).toBe(403);

    await page.goto("/admin/pedidos");
    const nav = page.getByRole("navigation", { name: "Navegación del panel" });
    await expect(nav.getByRole("link", { name: "Carta", exact: true })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Auditoría", exact: true })).toHaveCount(0);
  });
});

test.describe("customer", () => {
  test("«Mi cuenta» shows the data, points and orders and fits the screen", async ({
    page,
    context,
  }) => {
    await signIn(context, "customer");
    const errors = consoleErrors(page);
    await page.goto("/cuenta");
    await expect(page.getByText("Hola, e2e_cliente")).toBeVisible();
    await expect(page.getByText("150", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Cargando", { exact: false })).toHaveCount(0, { timeout: 15_000 });
    // Un cliente no ve accesos al panel y, con la opción desactivada, tampoco «Hazte administrador».
    await expect(page.getByRole("link", { name: "Panel del personal" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Hazte administrador" })).toHaveCount(0);
    await expectNoOverflow(page);
    await expectAccessible(page);
    expect(errors).toEqual([]);
  });

  test("cannot enter the administration even by typing the address", async ({ page, context }) => {
    await signIn(context, "customer");
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Acceso restringido" })).toBeVisible();
    await expectNoOverflow(page);
    await expectAccessible(page);
  });

  test("the checkout opens with a saved cart without overflow", async ({ page, context }) => {
    await signIn(context, "customer");
    await page.goto("/pedido");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoOverflow(page);
    await expectAccessible(page);
  });
});
