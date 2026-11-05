import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProductCard } from "@/features/menu/product-card";
import { DEMO_PRODUCTS } from "@/lib/demo-data";
import type { Product } from "@/types/menu";

function productById(id: string): Product {
  const product = DEMO_PRODUCTS.find((item) => item.id === id);
  if (!product) throw new Error(`Demo product ${id} not found`);
  return product;
}

describe("ProductCard", () => {
  it("shows name, price, ingredients and allergens", () => {
    render(<ProductCard product={productById("margherita")} />);

    expect(screen.getByRole("heading", { name: "Margherita" })).toBeInTheDocument();
    expect(screen.getByText(/9,50/)).toBeInTheDocument();
    expect(screen.getByText(/Mozzarella fior di latte/)).toBeInTheDocument();
    expect(screen.getByText(/Gluten, Lácteos/)).toBeInTheDocument();
    expect(screen.getByText("Vegetariano")).toBeInTheDocument();
  });

  it("flags unavailable products", () => {
    render(<ProductCard product={productById("cerveza")} />);
    expect(screen.getByText("No disponible")).toBeInTheDocument();
  });

  it("does not render an empty ingredient list", () => {
    render(<ProductCard product={productById("agua")} />);
    expect(screen.queryByText(/Ingredientes/)).not.toBeInTheDocument();
  });
});

describe("demo data", () => {
  it("uses unique product ids and valid decimal prices", () => {
    const ids = DEMO_PRODUCTS.map((product) => product.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const product of DEMO_PRODUCTS) {
      expect(product.price).toMatch(/^\d+\.\d{2}$/);
    }
  });
});
