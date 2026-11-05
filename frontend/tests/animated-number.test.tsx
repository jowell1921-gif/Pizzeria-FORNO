import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AnimatedNumber } from "@/components/ui/animated-number";
import { Stats } from "@/features/home/stats";
import { DEMO_PRODUCTS, DEMO_STORE } from "@/lib/demo-data";

describe("AnimatedNumber", () => {
  it("always keeps the real value in the HTML and exposes the target to CSS", () => {
    const { container } = render(<AnimatedNumber value={42} />);
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(container.firstElementChild).toHaveStyle({ "--target": "42" });
  });
});

describe("Stats", () => {
  it("derives its figures from the store configuration and the menu", () => {
    render(<Stats />);
    const available = DEMO_PRODUCTS.filter((product) => product.available).length;

    expect(screen.getByText(String(DEMO_STORE.prepTimeMinutes))).toBeInTheDocument();
    expect(screen.getByText(String(DEMO_STORE.deliveryTimeMinutes))).toBeInTheDocument();
    expect(screen.getByText(String(available))).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
  });

  it("exposes each figure with its label to assistive technology", () => {
    render(<Stats />);
    expect(screen.getAllByRole("term")).toHaveLength(4);
    expect(screen.getAllByRole("definition")).toHaveLength(4);
  });
});
