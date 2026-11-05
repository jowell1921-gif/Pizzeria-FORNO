import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { PUBLIC_PAGES } from "./pages";

for (const { path, name } of PUBLIC_PAGES) {
  test(`${name}: no WCAG 2.2 AA violations detected by axe`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    const summary = results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.slice(0, 3).map((node) => node.target.join(" ")),
    }));
    expect(summary).toEqual([]);
  });
}
