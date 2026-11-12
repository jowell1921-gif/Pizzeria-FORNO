import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const LAUNCHER = "Abrir el chat con PizzAI";

test("PizzAI floats in the bottom-right corner without covering the header controls", async ({
  page,
}) => {
  await page.goto("/");
  const launcher = page.getByRole("button", { name: LAUNCHER });
  await expect(launcher).toBeVisible();

  const viewport = page.viewportSize()!;
  const box = (await launcher.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  expect(box.x).toBeGreaterThan(viewport.width / 2);
  expect(box.y).toBeGreaterThan(viewport.height / 2);

  // No se superpone con la cabecera (carrito, menú, acceso).
  const header = (await page.locator("header").first().boundingBox())!;
  expect(box.y).toBeGreaterThan(header.y + header.height);
});

test("the chat opens, answers a suggestion as a demo and closes", async ({ page }) => {
  await page.goto("/carta");
  await page.getByRole("button", { name: LAUNCHER }).click();

  const chat = page.getByRole("dialog", { name: "Chat con PizzAI" });
  await expect(chat).toBeVisible();
  await expect(
    chat.getByText("¡Hola! Soy PizzAI, tu asistente de FORNEA. ¿Qué te apetece hoy?"),
  ).toBeVisible();

  const viewport = page.viewportSize()!;
  const box = (await chat.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  await chat.getByRole("button", { name: "¿Tenéis promociones?" }).click();
  await expect(chat.getByText("Respuesta de demostración (provisional)")).toBeVisible();
  await expect(chat.getByRole("link", { name: "Ver promociones" })).toBeVisible();

  await chat.getByRole("button", { name: "Cerrar el chat" }).click();
  await expect(chat).toBeHidden();
  await expect(page.getByRole("button", { name: LAUNCHER })).toBeFocused();
});

test("the open chat has no WCAG 2.2 AA violations", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: LAUNCHER }).click();
  await page
    .getByRole("dialog", { name: "Chat con PizzAI" })
    .getByRole("button", { name: "¿Qué me recomiendas?" })
    .click();
  await expect(page.getByText("Respuesta de demostración (provisional)")).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    results.violations.map((violation) => ({
      id: violation.id,
      targets: violation.nodes.slice(0, 3).map((node) => node.target.join(" ")),
    })),
  ).toEqual([]);
});
