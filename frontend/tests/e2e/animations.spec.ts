import { expect, test } from "@playwright/test";

const SUPPORTS_SCROLL_TIMELINE = "CSS.supports('animation-timeline: view()')";

test.describe("with motion allowed", () => {
  test.use({ reducedMotion: "no-preference" });

  test("the hero pizza floats up and down", async ({ page }) => {
    await page.goto("/");
    const floater = page.locator(".hero-float");
    await expect(floater).toHaveCSS("animation-name", "hero-float");

    // Se muestrean tres posiciones separadas en el tiempo: el movimiento debe ser vertical y suave.
    const samples: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      samples.push(await floater.evaluate((element) => element.getBoundingClientRect().top));
      await page.waitForTimeout(1000);
    }
    expect(new Set(samples.map((value) => Math.round(value))).size).toBeGreaterThan(1);
    expect(Math.max(...samples) - Math.min(...samples)).toBeLessThanOrEqual(21);
  });

  test("images are drawn in progressively while scrolling", async ({ page }) => {
    await page.goto("/carta");
    test.skip(
      !(await page.evaluate(SUPPORTS_SCROLL_TIMELINE)),
      "Scroll-driven animations not supported",
    );

    const image = page.locator(".scroll-image").last();
    const before = await image.evaluate((element) => {
      const style = getComputedStyle(element);
      return { opacity: Number(style.opacity), filter: style.filter };
    });
    expect(before.opacity, "invisible before reaching the viewport").toBeLessThan(0.5);
    expect(before.filter).toContain("grayscale");

    await image.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, 400));
    await expect
      .poll(() => image.evaluate((element) => Number(getComputedStyle(element).opacity)))
      .toBeGreaterThan(0.95);
    await expect
      .poll(() => image.evaluate((element) => getComputedStyle(element).filter))
      .toMatch(/^(none|grayscale\(0\) brightness\(1\) blur\(0px\))$/);
  });

  test("the hero layers move at different speeds while scrolling (depth)", async ({ page }) => {
    await page.goto("/");
    test.skip(
      !(await page.evaluate("CSS.supports('animation-timeline: scroll()')")),
      "Scroll-driven animations not supported",
    );

    const read = () =>
      page.evaluate(() => {
        const style = (selector: string) => getComputedStyle(document.querySelector(selector)!);
        return {
          pizza: style(".hero-depth").transform,
          copyOpacity: Number(style(".hero-copy").opacity),
          watermark: style(".hero-watermark").transform,
        };
      });

    const top = await read();
    expect(top.pizza === "none" || top.pizza.startsWith("matrix(1, 0, 0, 1, 0, 0")).toBe(true);
    expect(top.copyOpacity).toBe(1);

    await page.evaluate(() => window.scrollTo(0, 400));
    await expect.poll(async () => (await read()).copyOpacity).toBeLessThan(0.9);
    const scrolled = await read();
    expect(scrolled.pizza).not.toBe(top.pizza);
    expect(scrolled.watermark).not.toBe(top.watermark);
    // Las capas se mueven a distinta velocidad: no comparten transformación.
    expect(scrolled.pizza).not.toBe(scrolled.watermark);
  });

  test("counters count up while scrolling and end on the real value", async ({ page }) => {
    await page.goto("/");
    test.skip(
      !(await page.evaluate(SUPPORTS_SCROLL_TIMELINE)),
      "Scroll-driven animations not supported",
    );

    const counter = page.locator(".counter").first();
    const target = await counter.evaluate(
      (element) => element.querySelector(".counter-text")!.textContent,
    );
    await counter.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, 300));
    await expect
      .poll(() =>
        counter.evaluate((element) => getComputedStyle(element).getPropertyValue("--count")),
      )
      .toBe(target);
  });

  test("navigation between pages runs a directional view transition", async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __transitions: unknown[] };
      w.__transitions = [];
      const original = document.startViewTransition?.bind(document);
      if (!original) return;
      document.startViewTransition = ((arg: unknown) => {
        w.__transitions.push(
          typeof arg === "object" && arg ? (arg as { types?: unknown }).types : "fn",
        );
        return original(arg as never);
      }) as typeof document.startViewTransition;
    });
    await page.goto("/");
    test.skip(
      !(await page.evaluate("typeof document.startViewTransition === 'function'")),
      "View Transitions API not supported",
    );

    // Se espera a la hidratación de React: antes, el enlace haría una carga completa de página.
    await page.waitForFunction(() =>
      Object.keys(document.querySelector('a[href="/carta"]') ?? {}).some((key) =>
        key.startsWith("__reactProps"),
      ),
    );

    await page.getByRole("link", { name: /ver la carta/i }).click();
    await expect(page).toHaveURL(/\/carta$/);
    await expect(page.getByRole("heading", { level: 1, name: /nuestra carta/i })).toBeVisible();

    const transitions = await page.evaluate(
      () => (window as unknown as { __transitions: unknown[] }).__transitions,
    );
    expect(transitions.length, "startViewTransition was called").toBeGreaterThan(0);
    expect(JSON.stringify(transitions)).toContain("nav-forward");
    // La cabecera se mantiene anclada: tiene nombre de transición propio.
    await expect(page.locator("header").first()).toHaveCSS("view-transition-name", "site-header");
  });
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("nothing is animated and every image is fully visible", async ({ page }) => {
    await page.goto("/carta");
    await expect(page.locator(".scroll-image").last()).toHaveCSS("opacity", "1");
    await expect(page.locator(".scroll-image").last()).toHaveCSS("animation-name", "none");

    await page.goto("/");
    await expect(page.locator(".hero-float")).toHaveCSS("animation-name", "none");
    await expect(page.locator(".hero-enter")).toHaveCSS("animation-name", "none");
    await expect(page.locator(".hero-depth")).toHaveCSS("animation-name", "none");
    await expect(page.locator(".hero-watermark")).toHaveCSS("animation-name", "none");

    // Los contadores muestran el valor real como texto normal.
    const counterText = page.locator(".counter-text").first();
    await expect(counterText).toBeVisible();
    await expect(counterText).toHaveText(/^\d+$/);
  });
});
