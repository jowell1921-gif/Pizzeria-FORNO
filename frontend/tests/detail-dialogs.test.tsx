import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PromoCodeCard } from "@/features/account/promo-code-card";
import { clearPromoCode } from "@/features/account/promo-code-store";
import { ProductCard } from "@/features/menu/product-card";
import { PromotionCard } from "@/features/promotions/promotion-card";
import { DEMO_PRODUCTS, DEMO_PROMOTIONS } from "@/lib/demo-data";

const product = DEMO_PRODUCTS.find((item) => item.id === "margherita")!;
const welcome = DEMO_PROMOTIONS.find((item) => item.id === "bienvenida")!;
const combo = DEMO_PROMOTIONS.find((item) => item.id === "menu-forno")!;

afterEach(() => {
  clearPromoCode();
  vi.unstubAllGlobals();
});

describe("product detail dialog", () => {
  it("opens with the full information and an order button", async () => {
    const user = userEvent.setup();
    render(<ProductCard product={product} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: product.name }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Alérgenos");
    expect(dialog).toHaveTextContent("Precio con IVA incluido");
    // Sin sesión, «Pedir ahora» lleva a acceder.
    expect(screen.getByRole("link", { name: /Pedir ahora/ })).toHaveAttribute(
      "href",
      "/acceso?next=/carta",
    );

    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("does not offer to order an unavailable product", async () => {
    const user = userEvent.setup();
    const unavailable = DEMO_PRODUCTS.find((item) => !item.available)!;
    render(<ProductCard product={unavailable} />);

    await user.click(screen.getByRole("button", { name: unavailable.name }));
    expect(await screen.findByRole("button", { name: "No disponible" })).toBeDisabled();
  });
});

describe("promotion detail dialog", () => {
  it("shows the code and copies it to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    render(<PromotionCard promotion={welcome} />);

    await user.click(screen.getByRole("button", { name: welcome.title }));
    await user.click(await screen.findByRole("button", { name: "Copiar código" }));

    expect(writeText).toHaveBeenCalledWith("BIENVENIDO10");
    expect(await screen.findByText("Código copiado al portapapeles.")).toBeInTheDocument();
  });

  it("says when a promotion needs no code", async () => {
    const user = userEvent.setup();
    render(<PromotionCard promotion={combo} />);

    await user.click(screen.getByRole("button", { name: combo.title }));
    expect(await screen.findByText("Esta promoción no necesita código.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copiar código" })).not.toBeInTheDocument();
  });
});

describe("PromoCodeCard", () => {
  it("rejects a badly formed code and keeps a valid one in uppercase", async () => {
    const user = userEvent.setup();
    render(<PromoCodeCard />);

    await user.type(screen.getByLabelText("¿Tienes un código?"), "a!");
    await user.click(screen.getByRole("button", { name: "Guardar código" }));
    expect(await screen.findByText(/Introduce un código válido/)).toBeInTheDocument();

    await user.clear(screen.getByLabelText("¿Tienes un código?"));
    await user.type(screen.getByLabelText("¿Tienes un código?"), "bienvenido10");
    await user.click(screen.getByRole("button", { name: "Guardar código" }));
    expect(await screen.findByText("BIENVENIDO10")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Quitar código" }));
    expect(await screen.findByLabelText("¿Tienes un código?")).toBeInTheDocument();
  });
});
