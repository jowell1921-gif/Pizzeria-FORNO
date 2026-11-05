import { expect, test } from "@playwright/test";

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

  test("mobile menu opens and navigates", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Only relevant on small viewports");
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
