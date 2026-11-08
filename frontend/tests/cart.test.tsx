import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { linesFromServer } from "@/features/cart/cart-provider";
import { CartSheet } from "@/features/cart/cart-sheet";
import {
  cartItemCount,
  lineId,
  MAX_LINE_QUANTITY,
  toApiItems,
  useCartStore,
  useCartUi,
} from "@/features/cart/cart-store";
import { ProductConfigurator } from "@/features/menu/product-configurator";
import { fromCents, toCents } from "@/lib/money";

import { makeProduct } from "./fixtures";

const base = {
  productId: "p1",
  name: "Margherita",
  imageUrl: null,
  imageAlt: "",
  optionIds: ["o-medium"],
  optionSummary: "Mediana",
  notes: null,
};

beforeEach(() => {
  useCartStore.setState({ lines: [] });
  useCartUi.setState({ open: false });
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("money helpers", () => {
  it("converts decimal strings to integer cents and back without rounding errors", () => {
    expect(toCents("9.50")).toBe(950);
    expect(toCents("0.1")).toBe(10);
    expect(toCents("12")).toBe(1200);
    expect(toCents("-1.25")).toBe(-125);
    expect(fromCents(toCents("19.99") * 3)).toBe("59.97");
    expect(fromCents(5)).toBe("0.05");
    expect(() => toCents("abc")).toThrow();
  });
});

describe("cart store", () => {
  it("merges identical lines and keeps different options apart", () => {
    const { add } = useCartStore.getState();
    add({ ...base });
    add({ ...base, quantity: 2 });
    add({ ...base, optionIds: ["o-family"], optionSummary: "Familiar" });

    const { lines } = useCartStore.getState();
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ quantity: 3 });
    expect(cartItemCount(lines)).toBe(4);
  });

  it("treats the same product with a different note as a different line", () => {
    const { add } = useCartStore.getState();
    add({ ...base });
    add({ ...base, notes: "Sin albahaca" });
    expect(useCartStore.getState().lines).toHaveLength(2);
  });

  it("limits quantities between 1 and the maximum", () => {
    const { add, setQuantity } = useCartStore.getState();
    add({ ...base, quantity: 100 });
    expect(useCartStore.getState().lines[0]!.quantity).toBe(MAX_LINE_QUANTITY);
    setQuantity(lineId(base), 0);
    expect(useCartStore.getState().lines[0]!.quantity).toBe(1);
  });

  it("removes and clears lines", () => {
    const { add, remove, clear } = useCartStore.getState();
    add({ ...base });
    add({ ...base, productId: "p2" });
    remove(lineId(base));
    expect(useCartStore.getState().lines).toHaveLength(1);
    clear();
    expect(useCartStore.getState().lines).toEqual([]);
  });

  it("persists in the browser and is restored on return", async () => {
    useCartStore.getState().add({ ...base, quantity: 2 });
    const raw = window.localStorage.getItem("forno-cart-v1") ?? "{}";
    const saved = JSON.parse(raw);
    expect(saved.state.lines[0]).toMatchObject({ productId: "p1", quantity: 2 });

    // Simula volver a la web: la memoria está vacía pero el navegador conserva el carrito.
    useCartStore.setState({ lines: [] });
    window.localStorage.setItem("forno-cart-v1", raw);
    await useCartStore.persist.rehydrate();
    expect(useCartStore.getState().lines[0]).toMatchObject({ productId: "p1", quantity: 2 });
  });

  it("sends only identifiers and quantities to the server, never prices", () => {
    useCartStore.getState().add({ ...base, notes: "Sin albahaca", quantity: 2 });
    expect(toApiItems(useCartStore.getState().lines)).toEqual([
      { productId: "p1", quantity: 2, optionIds: ["o-medium"], notes: "Sin albahaca" },
    ]);
  });
});

describe("linesFromServer", () => {
  it("rebuilds display lines from the saved cart and the menu, dropping unknown products", () => {
    const product = makeProduct({ id: "p1" });
    const lines = linesFromServer(
      [
        { productId: "p1", quantity: 2, optionIds: ["o-family", "o-ham"], notes: null },
        { productId: "gone", quantity: 1, optionIds: [], notes: null },
      ],
      [product],
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      productId: "p1",
      name: "Margherita",
      quantity: 2,
      optionSummary: "Familiar, Jamón",
    });
  });
});

describe("ProductConfigurator", () => {
  it("preselects the defaults, updates the estimated price and adds the line to the cart", async () => {
    const user = userEvent.setup();
    const onAdded = vi.fn();
    render(<ProductConfigurator product={makeProduct({ id: "p1" })} onAdded={onAdded} />);

    expect(screen.getByRole("radio", { name: /Mediana/ })).toBeChecked();
    expect(screen.getByRole("button", { name: /Añadir al pedido · 9,50/ })).toBeEnabled();

    await user.click(screen.getByRole("radio", { name: /Familiar/ }));
    await user.click(screen.getByRole("checkbox", { name: /Mozzarella extra/ }));
    expect(screen.getByRole("button", { name: /· 15,00/ })).toBeInTheDocument(); // 9,50 + 4,00 + 1,50

    await user.click(screen.getByRole("button", { name: /Añadir una unidad/ }));
    expect(screen.getByRole("button", { name: /· 30,00/ })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Nota para este producto/), "Sin albahaca");
    await user.click(screen.getByRole("button", { name: /Añadir al pedido/ }));

    expect(onAdded).toHaveBeenCalled();
    expect(useCartUi.getState().open).toBe(true);
    expect(useCartStore.getState().lines[0]).toMatchObject({
      productId: "p1",
      quantity: 2,
      optionIds: ["o-family", "o-cheese"],
      optionSummary: "Familiar, Mozzarella extra",
      notes: "Sin albahaca",
    });
  });

  it("respects the maximum of optional choices", async () => {
    const user = userEvent.setup();
    render(<ProductConfigurator product={makeProduct()} onAdded={vi.fn()} />);

    await user.click(screen.getByRole("checkbox", { name: /Mozzarella extra/ }));
    await user.click(screen.getByRole("checkbox", { name: /Jamón/ }));
    // El grupo permite hasta 2: la tercera opción queda desactivada.
    expect(screen.getByRole("checkbox", { name: /Aceitunas/ })).toBeDisabled();
  });

  it("offers nothing to order when the product is unavailable", () => {
    render(<ProductConfigurator product={makeProduct({ available: false })} onAdded={vi.fn()} />);
    expect(screen.getByRole("button", { name: "No disponible" })).toBeDisabled();
  });
});

function wrap(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const quote = {
  type: "PICKUP",
  lines: [
    {
      productId: "p1",
      productName: "Margherita",
      quantity: 2,
      notes: null,
      unitPrice: "9.50",
      lineTotal: "19.00",
      options: [{ optionId: "o-medium", group: "Tamaño", name: "Mediana", priceDelta: "0.00" }],
    },
  ],
  discounts: [],
  totals: { subtotal: "19.00", discount: "0.00", deliveryFee: "0.00", tax: "1.73", total: "19.00" },
  delivery: null,
  estimatedMinutes: 20,
  pointsToEarn: 19,
};

describe("CartSheet", () => {
  it("shows an empty state with a link to the menu", async () => {
    const user = userEvent.setup();
    render(wrap(<CartSheet />));
    await user.click(screen.getByRole("button", { name: /Tu pedido, vacío/ }));
    expect(await screen.findByText("Tu pedido está vacío")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver la carta" })).toHaveAttribute("href", "/carta");
  });

  it("lists the lines with the server prices and lets the customer change quantities", async () => {
    const fetchMock = vi.fn(async () => Response.json({ data: quote }));
    vi.stubGlobal("fetch", fetchMock);
    useCartStore.getState().add({ ...base, quantity: 2 });
    const user = userEvent.setup();
    render(wrap(<CartSheet />));

    expect(screen.getByRole("button", { name: "Tu pedido, 2 unidades" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Tu pedido, 2 unidades/ }));

    expect(await screen.findByText("Margherita")).toBeInTheDocument();
    expect(await screen.findByText("Subtotal")).toBeInTheDocument();
    expect(screen.getAllByText(/19,00/).length).toBeGreaterThan(0);
    expect(screen.getByText(/IVA incluido \(1,73/)).toBeInTheDocument();

    // La petición solo lleva identificadores y cantidades.
    const calls = fetchMock.mock.calls as unknown as Array<[URL, RequestInit]>;
    const body = JSON.parse(String(calls[0]![1].body));
    expect(body).toEqual({
      items: [{ productId: "p1", quantity: 2, optionIds: ["o-medium"] }],
      type: "PICKUP",
    });
    expect(String(calls[0]![0])).toMatch(/\/checkout\/quote$/);

    await user.click(screen.getByRole("button", { name: "Quitar una unidad de Margherita" }));
    expect(useCartStore.getState().lines[0]!.quantity).toBe(1);

    await user.click(screen.getByRole("button", { name: "Quitar Margherita del pedido" }));
    await waitFor(() => expect(useCartStore.getState().lines).toEqual([]));
    expect(await screen.findByText("Tu pedido está vacío")).toBeInTheDocument();
  });

  it("warns when the server rejects the cart", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: { code: "PRODUCT_UNAVAILABLE", message: "x", requestId: "r" } },
          { status: 422 },
        ),
      ),
    );
    useCartStore.getState().add({ ...base });
    const user = userEvent.setup();
    render(wrap(<CartSheet />));
    await user.click(screen.getByRole("button", { name: /Tu pedido, 1 unidades/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /No hemos podido calcular el importe/,
    );
  });
});
