import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import HomePage from "@/app/(public)/page";

describe("home page", () => {
  it("renders the main heading and the order call to action", () => {
    render(<HomePage />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /pedir ahora/i }).length).toBeGreaterThan(0);
  });
});
