import { test } from "@playwright/test";

import { PUBLIC_PAGES } from "./pages";

// Capturas para revisión visual manual. Se ejecutan solo con CAPTURE=1.
// Cada página se guarda en tramos de 1600 px CSS para poder revisarla con detalle.
test.skip(!process.env.CAPTURE, "Solo bajo demanda");

const CHUNK_HEIGHT = 1600;

for (const { path, name } of PUBLIC_PAGES) {
  test(`screenshot ${name}`, async ({ page }, testInfo) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    // Sin animaciones, para que todas las imágenes aparezcan ya dibujadas en la captura completa.

    const size = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      height: document.documentElement.scrollHeight,
    }));

    for (let index = 0, y = 0; y < size.height; index += 1, y += CHUNK_HEIGHT) {
      await page.screenshot({
        path: `test-results/screens/${name}-${testInfo.project.name}-${index}.png`,
        fullPage: true,
        scale: "css",
        clip: { x: 0, y, width: size.width, height: Math.min(CHUNK_HEIGHT, size.height - y) },
      });
    }
  });
}
