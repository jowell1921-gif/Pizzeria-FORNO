import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PromoCodeCard } from "@/features/account/promo-code-card";
import { clearPromoCode } from "@/features/account/promo-code-store";
import { ProductCard } from "@/features/menu/product-card";
import { PromotionCard, validityText } from "@/features/promotions/promotion-card";

import { comboPromotion, makeProduct, makePromotion } from "./fixtures";

afterEach(() => {
  clearPromoCode();
  vi.unstubAllGlobals();
});

describe("product detail dialog", () => {
  it("opens with the full information and the options", async () => {
    const user = userEvent.setup();
    render(<ProductCard product={makeProduct()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Margherita" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Alérgenos");
    expect(dialog).toHaveTextContent("Tamaño");
    expect(screen.getByRole("button", { name: /Añadir al pedido/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("does not offer to order an unavailable product", async () => {
    const user = userEvent.setup();
    render(<ProductCard product={makeProduct({ available: false })} />);

    await user.click(screen.getByRole("button", { name: "Margherita" }));
    expect(await screen.findByRole("button", { name: "No disponible" })).toBeDisabled();
  });
});

describe("promotion detail dialog", () => {
  it("shows the code and copies it to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    const welcome = makePromotion();
    render(<PromotionCard promotion={welcome} />);

    await user.click(screen.getByRole("button", { name: welcome.name }));
    await user.click(await screen.findByRole("button", { name: "Copiar código" }));

    expect(writeText).toHaveBeenCalledWith("BIENVENIDO10");
    expect(await screen.findByText("Código copiado al portapapeles.")).toBeInTheDocument();
  });

  it("says when a promotion needs no code", async () => {
    const user = userEvent.setup();
    render(<PromotionCard promotion={comboPromotion} />);

    await user.click(screen.getByRole("button", { name: comboPromotion.name }));
    expect(await screen.findByText("Esta promoción no necesita código.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copiar código" })).not.toBeInTheDocument();
  });

  it("describes the validity from the promotion dates", () => {
    expect(validityText({ startsAt: null, endsAt: null })).toBe("Sin fecha de caducidad");
    expect(validityText({ startsAt: null, endsAt: "2026-12-31T22:59:59.000Z" })).toMatch(
      /^Hasta el /,
    );
    expect(validityText({ startsAt: "2026-11-01T00:00:00.000Z", endsAt: null })).toMatch(
      /^Desde el /,
    );
    expect(
      validityText({ startsAt: "2026-11-01T12:00:00.000Z", endsAt: "2026-11-30T12:00:00.000Z" }),
    ).toMatch(/^Del .* al /);
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
