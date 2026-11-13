import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DeliveryNotice } from "@/components/layout/delivery-notice";

describe("DeliveryNotice", () => {
  it("tells customers delivery covers the whole Comunidad de Madrid", () => {
    render(<DeliveryNotice />);
    expect(screen.getByRole("note")).toHaveTextContent(
      "Reparto a domicilio: Repartimos en toda la Comunidad de Madrid (códigos postales que empiezan por 28).",
    );
  });
});
