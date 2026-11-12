import { expect, test } from "@playwright/test";

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

  test("the menu banner grows in and then breathes subtly (small → big)", async ({ page }) => {
    await page.goto("/carta");
    await expect(page.locator(".banner-enter")).toHaveCSS("animation-name", "banner-enter");
    const breathe = page.locator(".banner-breathe");
    await expect(breathe).toHaveCSS("animation-name", "banner-breathe");

    // Tras la entrada, se muestrea la escala de la imagen: debe variar, pero solo un poco.
    await page.waitForTimeout(1500);
    const scales: number[] = [];
    for (let i = 0; i < 9; i += 1) {
      scales.push(
        await breathe.evaluate(
          (element) => element.getBoundingClientRect().width / element.clientWidth,
        ),
      );
      await page.waitForTimeout(600);
    }
    expect(
      Math.max(...scales) - Math.min(...scales),
      "the image grows and shrinks",
    ).toBeGreaterThan(0.01);
    expect(Math.min(...scales), "subtle: never much smaller").toBeGreaterThan(0.95);
    expect(Math.max(...scales), "subtle: never much bigger").toBeLessThan(1.05);
  });

  for (const path of ["/", "/carta"]) {
    test(`product photos are static and always visible (${path})`, async ({ page }) => {
      await page.goto(path);
      const photos = page.locator("article img");
      expect(await photos.count()).toBeGreaterThan(1);

      // Incluso las que están fuera de pantalla: sin animación, opacas y sin filtros.
      const states = await photos.evaluateAll((elements) =>
        elements.map((element) => {
          const style = getComputedStyle(element);
          return {
            animation: style.animationName,
            opacity: style.opacity,
            filter: style.filter,
            clip: style.clipPath,
          };
        }),
      );
      for (const state of states) {
        expect(state).toEqual({ animation: "none", opacity: "1", filter: "none", clip: "none" });
      }
    });
  }

  test("the hero background shows falling leaves and rising embers", async ({ page }) => {
    await page.goto("/");
    const leaves = page.locator(".ambient-leaf");
    expect(await leaves.count()).toBeGreaterThanOrEqual(8);
    expect(await page.locator(".ambient-ember").count()).toBeGreaterThanOrEqual(6);
    await expect(leaves.first()).toHaveCSS("animation-name", "leaf-fall");
    await expect(page.locator(".ambient-ember").first()).toHaveCSS("animation-name", "ember-rise");

    // Las hojas se mueven: su posición vertical cambia con el tiempo.
    const read = () => leaves.first().evaluate((element) => element.getBoundingClientRect().top);
    const first = await read();
    await page.waitForTimeout(1200);
    expect(await read()).not.toBeCloseTo(first, 0);
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
          copy: style(".hero-copy").transform,
          copyOpacity: Number(style(".hero-copy").opacity),
          watermark: style(".hero-watermark").transform,
        };
      });

    const top = await read();
    expect(top.pizza === "none" || top.pizza.startsWith("matrix(1, 0, 0, 1, 0, 0")).toBe(true);
    expect(top.copyOpacity).toBe(1);

    await page.evaluate(() => window.scrollTo(0, 400));
    await expect.poll(async () => (await read()).copy).not.toBe(top.copy);
    const scrolled = await read();
    // El texto y los botones del hero nunca se vuelven transparentes al hacer scroll.
    expect(scrolled.copyOpacity).toBe(1);
    expect(scrolled.pizza).not.toBe(top.pizza);
    expect(scrolled.watermark).not.toBe(top.watermark);
    // Las capas se mueven a distinta velocidad: no comparten transformación.
    expect(scrolled.pizza).not.toBe(scrolled.watermark);

    // La pizza solo se desplaza y gira: no se agranda (la escala de una matriz es hypot(a, b)).
    const [a, b] = scrolled.pizza
      .match(/matrix\(([^)]+)\)/)![1]!
      .split(",")
      .map(Number) as [number, number];
    expect(Math.hypot(a, b)).toBeCloseTo(1, 3);
  });

  test("counters wait at zero, then visibly count up for a few seconds", async ({ page }) => {
    // Altura reducida para que la franja de cifras quede fuera de pantalla al cargar.
    await page.setViewportSize({ width: page.viewportSize()!.width, height: 600 });
    await page.goto("/");

    const counter = page.locator(".counter").first();
    const target = await counter.evaluate(
      (element) => element.querySelector(".counter-text")!.textContent,
    );
    const readCount = () =>
      counter.evaluate((element) => getComputedStyle(element).getPropertyValue("--count"));

    // Antes de verse: armado y en cero.
    await expect(counter).toHaveAttribute("data-counter", "armed");
    expect(await readCount()).toBe("0");

    await counter.scrollIntoViewIfNeeded();
    await expect(counter).toHaveAttribute("data-counter", "running");

    // Se muestrea la cuenta: debe pasar por valores intermedios y tardar en llegar al final.
    const started = Date.now();
    const values: number[] = [];
    let finishedAt = 0;
    while (Date.now() - started < 8000) {
      const value = await readCount();
      values.push(Number(value));
      if (value === target) {
        finishedAt = Date.now() - started;
        break;
      }
      await page.waitForTimeout(150);
    }

    expect(
      values.some((value) => value > 0 && value < Number(target)),
      "intermediate values",
    ).toBe(true);
    expect(finishedAt, "reaches the real value").toBeGreaterThan(0);
    expect(finishedAt, "slow enough to be watched").toBeGreaterThan(1500);
    // La cuenta nunca retrocede.
    expect(values).toEqual([...values].sort((a, b) => a - b));
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
    await expect(page.locator(".banner-enter")).toHaveCSS("animation-name", "none");
    await expect(page.locator(".banner-breathe")).toHaveCSS("animation-name", "none");
    await expect(page.locator(".banner-enter")).toHaveCSS("opacity", "1");

    await page.goto("/");
    await expect(page.locator(".hero-float")).toHaveCSS("animation-name", "none");
    await expect(page.locator(".hero-enter")).toHaveCSS("animation-name", "none");
    await expect(page.locator(".hero-depth")).toHaveCSS("animation-name", "none");
    await expect(page.locator(".hero-watermark")).toHaveCSS("animation-name", "none");
    // Sin movimiento, el fondo del hero no muestra partículas.
    await expect(page.locator(".ambient-particles")).toBeHidden();

    // Los contadores muestran el valor real como texto normal y no se arman.
    const counterText = page.locator(".counter-text").first();
    await expect(counterText).toBeVisible();
    await expect(counterText).toHaveText(/^\d+$/);
    await expect(page.locator(".counter").first()).not.toHaveAttribute("data-counter", /.*/);
  });
});

test.describe("page backgrounds", () => {
  test.use({ reducedMotion: "no-preference" });

  const watermark = (page: import("@playwright/test").Page) =>
    page.locator('[aria-hidden="true"]').filter({ hasText: /^FORNEA$/ });

  test("promotions shows the same FORNEA letters as the home page", async ({ page }) => {
    const read = async (path: string) => {
      await page.goto(path);
      const letters = watermark(page);
      await expect(letters).toHaveCount(1);
      return letters.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          fontSize: style.fontSize,
          fontFamily: style.fontFamily,
          stroke: style.getPropertyValue("-webkit-text-stroke-width"),
          fill:
            style.color === "rgba(0, 0, 0, 0)" || style.webkitTextFillColor === "rgba(0, 0, 0, 0)",
        };
      });
    };

    const home = await read("/");
    const promotions = await read("/promociones");
    expect(promotions).toEqual(home);
    expect(promotions.stroke).toBe("2px");
  });

  test("FORNEA CLUB has the animated dark background without letters or image", async ({
    page,
  }) => {
    await page.goto("/");
    const heroBackground = await page
      .locator("#hero-title")
      .evaluate((element) => getComputedStyle(element.closest("section")!).backgroundColor);

    await page.goto("/forno-club");
    const header = page.locator(".ambient-particles").locator("xpath=..");
    await expect(header).toHaveCSS("background-color", heroBackground);
    expect(await page.locator(".ambient-leaf").count()).toBeGreaterThanOrEqual(8);
    expect(await page.locator(".ambient-ember").count()).toBeGreaterThanOrEqual(6);
    await expect(page.locator(".ambient-leaf").first()).toHaveCSS("animation-name", "leaf-fall");

    // Sin letras de fondo y sin imágenes en la cabecera.
    await expect(watermark(page)).toHaveCount(0);
    await expect(header.locator("img")).toHaveCount(0);
  });
});
