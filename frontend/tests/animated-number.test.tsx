import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AnimatedNumber } from "@/components/ui/animated-number";
import { StatsView } from "@/features/home/stats";
import { DEMO_STORE } from "@/lib/demo-data";

type ObserverCallback = (entries: Array<{ isIntersecting: boolean }>) => void;

/** IntersectionObserver de prueba: permite simular la entrada en pantalla con `trigger`. */
function stubIntersectionObserver() {
  const callbacks: ObserverCallback[] = [];
  class FakeObserver {
    constructor(callback: ObserverCallback) {
      callbacks.push(callback);
    }
    observe() {}
    disconnect() {}
    unobserve() {}
  }
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  return {
    trigger: (isIntersecting: boolean) => callbacks.forEach((cb) => cb([{ isIntersecting }])),
  };
}

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduce && query.includes("reduce"),
  }));
}

describe("AnimatedNumber", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("always keeps the real value in the HTML and exposes the target to CSS", () => {
    const { container } = render(<AnimatedNumber value={42} />);
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(container.firstElementChild).toHaveStyle({ "--target": "42" });
  });

  it("waits at zero until it enters the viewport, then starts counting", () => {
    stubReducedMotion(false);
    const observer = stubIntersectionObserver();
    const { container } = render(<AnimatedNumber value={20} />);
    const counter = container.firstElementChild as HTMLElement;

    expect(counter.dataset.counter).toBe("armed");
    observer.trigger(false);
    expect(counter.dataset.counter).toBe("armed");
    observer.trigger(true);
    expect(counter.dataset.counter).toBe("running");
  });

  it("is not armed with reduced motion: the real number stays visible", () => {
    stubReducedMotion(true);
    stubIntersectionObserver();
    const { container } = render(<AnimatedNumber value={20} />);
    expect((container.firstElementChild as HTMLElement).dataset.counter).toBeUndefined();
  });

  it("is not armed when IntersectionObserver is unavailable", () => {
    stubReducedMotion(false);
    vi.stubGlobal("IntersectionObserver", undefined);
    const { container } = render(<AnimatedNumber value={20} />);
    expect((container.firstElementChild as HTMLElement).dataset.counter).toBeUndefined();
  });
});

describe("Stats", () => {
  it("derives its figures from the store configuration and the menu", () => {
    render(<StatsView productCount={15} cheapestReward={100} />);

    expect(screen.getByText(String(DEMO_STORE.prepTimeMinutes))).toBeInTheDocument();
    expect(screen.getByText(String(DEMO_STORE.deliveryTimeMinutes))).toBeInTheDocument();
    expect(screen.getByText("15")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
  });

  it("exposes each figure with its label to assistive technology", () => {
    render(<StatsView productCount={15} cheapestReward={100} />);
    expect(screen.getAllByRole("term")).toHaveLength(4);
    expect(screen.getAllByRole("definition")).toHaveLength(4);
  });

  it("omits the product count when the menu could not be loaded", () => {
    render(<StatsView productCount={null} cheapestReward={100} />);
    expect(screen.getAllByRole("term")).toHaveLength(3);
  });
});
