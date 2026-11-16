import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DeliveryNotice } from "@/components/layout/delivery-notice";

describe("DeliveryNotice", () => {
  it("tells customers any postal code is accepted in the demo", () => {
    render(<DeliveryNotice />);
    expect(screen.getByRole("note")).toHaveTextContent(
      "Reparto a domicilio: En esta demostración puedes pedir a domicilio con cualquier código postal.",
    );
  });
});
