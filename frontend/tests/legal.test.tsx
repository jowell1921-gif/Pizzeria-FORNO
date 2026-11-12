import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AvisoLegal } from "@/features/legal/aviso-legal";
import { CondicionesDeCompra } from "@/features/legal/condiciones-de-compra";
import { Cookies } from "@/features/legal/cookies";
import { Privacidad } from "@/features/legal/privacidad";
import { COMPANY } from "@/lib/legal";

describe("legal documents", () => {
  it.each([
    ["Aviso legal", AvisoLegal],
    ["Política de privacidad", Privacidad],
    ["Política de cookies", Cookies],
    ["Condiciones de compra", CondicionesDeCompra],
  ])("%s names the data controller and has no leftover placeholder note", (_name, Document) => {
    const { container } = render(<Document />);
    expect(container.textContent).toContain(COMPANY.name);
    expect(container.textContent).toContain("Última actualización");
    expect(screen.queryByText(/\[PENDIENTE\] Texto legal por redactar/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2 }).length).toBeGreaterThan(3);
  });

  it("does not invent the owner's tax and contact data: unknown values stay visibly pending", () => {
    for (const value of [COMPANY.taxId, COMPANY.registeredAddress, COMPANY.email]) {
      expect(value).toMatch(/^\[.*pendiente.*\]$/);
    }
  });

  it("only declares the storage the site really uses (no analytics or advertising)", () => {
    render(<Cookies />);
    expect(screen.getByText(/No usamos cookies de análisis, de publicidad/)).toBeInTheDocument();
    for (const key of ["forno-cart-v1", "forno-promo-code", "forno-admin-offer-v1"]) {
      expect(screen.getByText(new RegExp(key))).toBeInTheDocument();
    }
  });
});
