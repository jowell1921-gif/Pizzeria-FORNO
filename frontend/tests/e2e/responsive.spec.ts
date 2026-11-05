import { expect, test } from "@playwright/test";

import { PUBLIC_PAGES } from "./pages";

for (const { path, name } of PUBLIC_PAGES) {
  test.describe(`${name} (${path})`, () => {
    test("has a single h1 and no horizontal overflow", async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, "horizontal overflow in px").toBeLessThanOrEqual(0);
    });

    test("has no elements wider than the viewport", async ({ page }) => {
      await page.goto(path);
      const offenders = await page.evaluate(() => {
        const limit = document.documentElement.clientWidth;
        return Array.from(document.body.querySelectorAll<HTMLElement>("*"))
          .filter((element) => {
            // Se ignoran los carruseles con scroll propio y las capas decorativas (aria-hidden),
            // que se recortan a propósito con overflow-hidden (halo y marca de agua del hero).
            if (
              element.closest("[data-scrollable]") ||
              element.closest("nav ul") ||
              element.closest('[aria-hidden="true"]')
            )
              return false;
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.right > limit + 1;
          })
          .slice(0, 5)
          .map((element) => `${element.tagName.toLowerCase()}.${element.className}`);
      });
      expect(offenders).toEqual([]);
    });

    test("has no console errors", async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      expect(errors).toEqual([]);
    });
  });
}
