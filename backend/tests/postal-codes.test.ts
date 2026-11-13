import { describe, expect, it } from "vitest";

import {
  POSTAL_CODE_ENTRY,
  describePostalCodes,
  entryCovers,
  findZoneForPostalCode,
} from "../src/modules/delivery/postal-codes.js";

describe("postal code entries", () => {
  it("accepts a 5-digit code or a 2-digit prefix with an asterisk, nothing else", () => {
    for (const ok of ["28029", "08001", "28*"]) expect(POSTAL_CODE_ENTRY.test(ok)).toBe(true);
    for (const bad of ["*", "2*", "280*", "28", "2802a", "28029*", "28* ", "*28", "28.*"]) {
      expect(POSTAL_CODE_ENTRY.test(bad), bad).toBe(false);
    }
  });

  it("matches exact codes and prefixes", () => {
    expect(entryCovers("28029", "28029")).toBe(true);
    expect(entryCovers("28029", "28030")).toBe(false);
    expect(entryCovers("28*", "28999")).toBe(true);
    expect(entryCovers("28*", "08028")).toBe(false);
    expect(entryCovers("28*", "29028")).toBe(false);
  });

  it("prefers the zone that names the code exactly over the one that covers it by prefix", () => {
    const wide = { name: "Comunidad", postalCodes: ["28*"] };
    const centre = { name: "Centro", postalCodes: ["28001"] };
    expect(findZoneForPostalCode([wide, centre], "28001")).toBe(centre);
    expect(findZoneForPostalCode([centre, wide], "28001")).toBe(centre);
    expect(findZoneForPostalCode([wide, centre], "28500")).toBe(wide);
    expect(findZoneForPostalCode([wide, centre], "46001")).toBeNull();
  });

  it("describes a prefix in plain words", () => {
    expect(describePostalCodes(["28001", "28*"])).toBe(
      "28001, 28* (todos los que empiezan por 28)",
    );
  });
});
