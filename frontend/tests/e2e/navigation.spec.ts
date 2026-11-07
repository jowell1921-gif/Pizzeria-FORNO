import { expect, test, type Page } from "@playwright/test";

/** Por debajo de 1024 px la navegación está en el menú desplegable. */
const usesMenuButton = (page: Page) => (page.viewportSize()?.width ?? 0) < 1024;

test.describe("navigation", () => {
  test("primary actions reach the menu", async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("link", { name: /pedir ahora/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/carta$/);
    await expect(page.getByRole("heading", { level: 1, name: /nuestra carta/i })).toBeVisible();
  });

  test("the menu lists every category", async ({ page }) => {
    await page.goto("/carta");
    for (const name of ["Pizzas", "Entrantes", "Bebidas", "Postres"]) {
      await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
    }
  });

  test("«Principal» is the first link and goes back to the home page", async ({ page }) => {
    const isMobile = usesMenuButton(page);
    await page.goto("/carta");
    let nav = page.getByRole("navigation", { name: "Navegación principal", exact: true });
    if (isMobile) {
      await page.getByRole("button", { name: "Abrir menú" }).click();
      nav = page.getByRole("dialog").getByRole("navigation");
    }

    const links = nav.getByRole("link");
    await expect(links.first()).toHaveText("Principal");
    await expect(links.nth(1)).toHaveText("Carta");
    await expect(nav.getByRole("link", { name: "Carta" })).toHaveAttribute("aria-current", "page");
    await expect(nav.getByRole("link", { name: "Principal" })).not.toHaveAttribute("aria-current");

    await nav.getByRole("link", { name: "Principal" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: /pizza de horno/i })).toBeVisible();

    // Estando en la portada, «Principal» es la página actual.
    if (isMobile) await page.getByRole("button", { name: "Abrir menú" }).click();
    await expect(nav.getByRole("link", { name: "Principal" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("mobile menu opens and navigates", async ({ page }) => {
    test.skip(!usesMenuButton(page), "Only relevant when the menu button is shown");
    await page.goto("/");
    await page.getByRole("button", { name: "Abrir menú" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("link", { name: "Promociones" }).click();
    await expect(page).toHaveURL(/\/promociones$/);
    await expect(dialog).toBeHidden();
  });

  test("unknown routes show the 404 page", async ({ page }) => {
    const response = await page.goto("/no-existe");
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { level: 1, name: /página no encontrada/i }),
    ).toBeVisible();
  });

  test("keyboard users can skip to the content", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skipLink = page.getByRole("link", { name: "Saltar al contenido" });
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toBeVisible();
  });
});
