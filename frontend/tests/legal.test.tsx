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

  it.each([
    ["Aviso legal", AvisoLegal],
    ["Política de privacidad", Privacidad],
    ["Condiciones de compra", CondicionesDeCompra],
  ])(
    "%s does not claim a legal entity, tax id or registered address that does not exist yet",
    (_name, Document) => {
      const { container } = render(<Document />);
      expect(container.textContent).not.toMatch(/\[[^\]]*pendiente[^\]]*\]/i);
      expect(container.textContent).not.toMatch(/NIF\/CIF [A-Z0-9]/);
      expect(container.textContent).toMatch(/demostración/);
    },
  );

  it("states where delivery is available", () => {
    const { container } = render(<CondicionesDeCompra />);
    expect(container.textContent).toContain("repartimos en toda la Comunidad de Madrid");
  });

  it("only declares the storage the site really uses (no analytics or advertising)", () => {
    render(<Cookies />);
    expect(screen.getByText(/No usamos cookies de análisis, de publicidad/)).toBeInTheDocument();
    for (const key of ["fornea-cart-v1", "fornea-promo-code", "fornea-admin-offer-v1"]) {
      expect(screen.getByText(new RegExp(key))).toBeInTheDocument();
    }
  });
});
