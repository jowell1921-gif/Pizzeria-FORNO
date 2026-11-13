import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Flujo de compra sin sesión, contra la API real (con los datos de demostración sembrados).
 * El pago y la creación del pedido exigen cuenta: se prueban con la API en el backend y con el
 * checkout simulado en las pruebas unitarias; el flujo real con Supabase se verifica a mano.
 */

async function openProduct(page: Page, name: string) {
  await page.goto("/carta");
  const trigger = page.getByRole("button", { name, exact: true }).first();
  await trigger.scrollIntoViewIfNeeded();
  // Espera a que React hidrate la página antes de pulsar.
  await page.waitForFunction(() => document.querySelector("[data-slot='dialog-trigger']") !== null);
  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

// Cada prueba usa un contexto de navegador nuevo: el carrito empieza vacío.

test("the menu comes from the API with categories and product cards", async ({ page }) => {
  await page.goto("/carta");
  await expect(page.getByRole("heading", { level: 1, name: /nuestra carta/i })).toBeVisible();
  for (const category of ["Pizzas", "Entrantes", "Bebidas", "Postres"]) {
    await expect(page.getByRole("link", { name: category, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Margherita", exact: true }).first()).toBeVisible();
});

test("a product is configured, added to the order and priced by the server", async ({ page }) => {
  await openProduct(page, "Margherita");
  const dialog = page.getByRole("dialog");

  await dialog.getByRole("radio", { name: /Familiar/ }).check();
  await dialog.getByRole("button", { name: /Añadir al pedido/ }).click();

  const cart = page.getByRole("dialog", { name: "Tu pedido" });
  await expect(cart).toBeVisible();
  await expect(cart.getByText("Margherita")).toBeVisible();
  await expect(cart.getByText(/Familiar/)).toBeVisible();
  // 9,50 € + 4,00 € del tamaño familiar, calculado por el servidor.
  await expect(cart.getByText("Subtotal")).toBeVisible();
  await expect(cart.getByText("13,50 €").first()).toBeVisible();

  await cart.getByRole("button", { name: "Añadir una unidad de Margherita" }).click();
  await expect(cart.getByText("27,00 €").first()).toBeVisible();
});

test("the order survives a reload and shows the count in the header", async ({ page }) => {
  await openProduct(page, "Margherita");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Añadir al pedido/ })
    .click();
  await expect(page.getByRole("dialog", { name: "Tu pedido" })).toBeVisible();

  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("fornea-cart-v1")))
    .toContain("Margherita");

  await page.reload();
  await expect(page.getByRole("button", { name: /Tu pedido, 1 unidades/ })).toBeVisible();
});

test("finishing the order requires an account", async ({ page }) => {
  await openProduct(page, "Margherita");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Añadir al pedido/ })
    .click();
  await page.getByRole("link", { name: "Finalizar pedido" }).click();
  await expect(page).toHaveURL(/\/acceso\?next=%2Fpedido/);
});

test("promotions come from the API and the code can be copied", async ({ page }) => {
  await page.goto("/promociones");
  await page.waitForFunction(() => document.querySelector("[data-slot='dialog-trigger']") !== null);
  await page.getByRole("button", { name: /10 % en tu primer pedido/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("BIENVENIDO10")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Copiar código" })).toBeVisible();
});

test("the product dialog and the order panel have no WCAG 2.2 AA violations", async ({ page }) => {
  await openProduct(page, "Margherita");
  const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
  const check = async () => {
    const results = await new AxeBuilder({ page }).withTags(tags).analyze();
    return results.violations.map((violation) => ({
      id: violation.id,
      targets: violation.nodes.slice(0, 3).map((node) => node.target.join(" ")),
    }));
  };
  expect(await check()).toEqual([]);

  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Añadir al pedido/ })
    .click();
  await expect(page.getByRole("dialog", { name: "Tu pedido" })).toBeVisible();
  expect(await check()).toEqual([]);
});

test("the order panel and dialogs fit the screen without horizontal overflow", async ({ page }) => {
  await openProduct(page, "Margherita");
  const overflow = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
  expect(await overflow()).toBeLessThanOrEqual(0);

  const dialogBox = await page.getByRole("dialog").boundingBox();
  const viewport = page.viewportSize()!;
  expect(dialogBox!.x).toBeGreaterThanOrEqual(0);
  expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(viewport.width);

  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Añadir al pedido/ })
    .click();
  const cart = page.getByRole("dialog", { name: "Tu pedido" });
  await expect(cart).toBeVisible();
  // El panel entra deslizándose: se espera a que termine la animación antes de medirlo.
  await expect
    .poll(async () => {
      const box = await cart.boundingBox();
      return box ? box.x + box.width : Infinity;
    })
    .toBeLessThanOrEqual(viewport.width + 1);
  expect(await overflow()).toBeLessThanOrEqual(0);
});

test("FORNEA CLUB shows the points rule and the rewards from the API", async ({ page }) => {
  await page.goto("/fornea-club");
  await expect(page.getByRole("heading", { level: 1, name: "FORNEA CLUB" })).toBeVisible();
  await expect(page.getByText(/sumas 1 punto/i)).toBeVisible();
  await expect(page.getByText("Bebida gratis")).toBeVisible();
  await expect(page.getByText("400 puntos")).toBeVisible();
});
