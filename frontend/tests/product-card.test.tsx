import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProductCard } from "@/features/menu/product-card";

import { makeProduct, noOptionsProduct } from "./fixtures";

describe("ProductCard", () => {
  it("shows name, base price, ingredients and allergens", () => {
    render(<ProductCard product={makeProduct()} />);

    expect(screen.getByRole("heading", { name: "Margherita" })).toBeInTheDocument();
    expect(screen.getByText(/9,50/)).toBeInTheDocument();
    expect(screen.getByText(/Mozzarella fior di latte/)).toBeInTheDocument();
    expect(screen.getByText(/Gluten, Lácteos/)).toBeInTheDocument();
    expect(screen.getByText("Vegetariano")).toBeInTheDocument();
  });

  it("flags unavailable products", () => {
    render(<ProductCard product={makeProduct({ available: false })} />);
    expect(screen.getByText("No disponible")).toBeInTheDocument();
  });

  it("does not render an empty ingredient list", () => {
    render(<ProductCard product={noOptionsProduct} />);
    expect(screen.queryByText(/Ingredientes/)).not.toBeInTheDocument();
  });
});
