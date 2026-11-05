import { describe, expect, it } from "vitest";

import { formatEuro } from "@/lib/format";

// Intl usa un espacio de no separación (U+00A0) entre el importe y el símbolo.
const normalize = (value: string) => value.replace(/ /g, " ");

describe("formatEuro", () => {
  it("formats decimal strings in Spanish locale", () => {
    expect(normalize(formatEuro("9.50"))).toBe("9,50 €");
    expect(normalize(formatEuro("12"))).toBe("12,00 €");
  });

  it("formats thousands with a separator", () => {
    expect(normalize(formatEuro("1234.5"))).toBe("1234,50 €");
  });

  it("rejects values that are not numbers", () => {
    expect(() => formatEuro("abc")).toThrow(/Invalid amount/);
  });
});
