import { describe, expect, it } from "vitest";

import { Prisma } from "../src/db/client.js";
import { cents, taxIncluded } from "../src/modules/checkout/pricing.js";
import {
  asapAvailable,
  listSlots,
  zonedTimeToUtc,
  type OpeningData,
  type ScheduleSettings,
} from "../src/modules/store/scheduling.js";

const TZ = "Europe/Madrid";
const settings: ScheduleSettings = {
  timezone: TZ,
  prepTimeMinutes: 20,
  deliveryTimeMinutes: 40,
  slotMinutes: 15,
  maxAdvanceDays: 2,
  ordersPaused: false,
};
/** Todos los días de 13:00 a 15:00. */
const data: OpeningData = {
  weekly: [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({
    dayOfWeek,
    openMinute: 13 * 60,
    closeMinute: 15 * 60,
  })),
  special: [],
};

describe("zonedTimeToUtc", () => {
  it("converts a local time to UTC in winter and summer", () => {
    expect(zonedTimeToUtc("2026-11-10", 13 * 60, TZ).toISOString()).toBe(
      "2026-11-10T12:00:00.000Z",
    );
    expect(zonedTimeToUtc("2026-07-14", 13 * 60, TZ).toISOString()).toBe(
      "2026-07-14T11:00:00.000Z",
    );
  });

  it("is correct around the daylight saving changes", () => {
    // Último domingo de marzo de 2026: a las 02:00 se pasa a las 03:00 (UTC+2).
    expect(zonedTimeToUtc("2026-03-29", 13 * 60, TZ).toISOString()).toBe(
      "2026-03-29T11:00:00.000Z",
    );
    // Último domingo de octubre de 2026: a las 03:00 se pasa a las 02:00 (UTC+1).
    expect(zonedTimeToUtc("2026-10-25", 13 * 60, TZ).toISOString()).toBe(
      "2026-10-25T12:00:00.000Z",
    );
  });
});

describe("listSlots", () => {
  // Martes 10 de noviembre de 2026, 12:00 en Madrid (11:00 UTC).
  const now = new Date("2026-11-10T11:00:00Z");

  it("offers aligned slots inside the opening hours with enough lead time", () => {
    const slots = listSlots(settings, data, "PICKUP", "2026-11-10", now);
    // 13:00 en Madrid = 12:00 UTC; el último inicio es 14:45. Preparación: 20 min -> desde las 12:20.
    expect(slots[0]!.toISOString()).toBe("2026-11-10T12:00:00.000Z");
    expect(slots.at(-1)!.toISOString()).toBe("2026-11-10T13:45:00.000Z");
    expect(slots).toHaveLength(8);
  });

  it("requires more lead time for deliveries", () => {
    const late = new Date("2026-11-10T11:50:00Z"); // 12:50 en Madrid
    const pickup = listSlots(settings, data, "PICKUP", "2026-11-10", late);
    const delivery = listSlots(settings, data, "DELIVERY", "2026-11-10", late);
    expect(pickup[0]!.toISOString()).toBe("2026-11-10T12:15:00.000Z"); // 13:15 (>= 13:10)
    expect(delivery[0]!.toISOString()).toBe("2026-11-10T12:30:00.000Z"); // 13:30 (>= 13:30)
  });

  it("is empty before today, after the advance limit and on closed days", () => {
    expect(listSlots(settings, data, "PICKUP", "2026-11-09", now)).toEqual([]);
    expect(listSlots(settings, data, "PICKUP", "2026-11-13", now)).toEqual([]);
    expect(listSlots(settings, data, "PICKUP", "2026-11-12", now)).not.toEqual([]);
    const closed: OpeningData = {
      ...data,
      special: [{ date: "2026-11-11", closed: true, openMinute: null, closeMinute: null }],
    };
    expect(listSlots(settings, closed, "PICKUP", "2026-11-11", now)).toEqual([]);
  });

  it("uses the special day schedule instead of the weekly one", () => {
    const special: OpeningData = {
      ...data,
      special: [{ date: "2026-11-11", closed: false, openMinute: 18 * 60, closeMinute: 19 * 60 }],
    };
    const slots = listSlots(settings, special, "PICKUP", "2026-11-11", now);
    expect(slots.map((slot) => slot.toISOString())).toEqual([
      "2026-11-11T17:00:00.000Z",
      "2026-11-11T17:15:00.000Z",
      "2026-11-11T17:30:00.000Z",
      "2026-11-11T17:45:00.000Z",
    ]);
  });
});

describe("asapAvailable", () => {
  it("needs the store open and orders not paused", () => {
    expect(asapAvailable(settings, data, new Date("2026-11-10T12:30:00Z"))).toBe(true); // 13:30
    expect(asapAvailable(settings, data, new Date("2026-11-10T09:00:00Z"))).toBe(false); // 10:00
    expect(
      asapAvailable({ ...settings, ordersPaused: true }, data, new Date("2026-11-10T12:30:00Z")),
    ).toBe(false);
  });
});

describe("money rounding", () => {
  it("extracts the VAT contained in a VAT-inclusive amount (half up)", () => {
    expect(taxIncluded(new Prisma.Decimal("11.00"), new Prisma.Decimal(10)).toFixed(2)).toBe(
      "1.00",
    );
    expect(taxIncluded(new Prisma.Decimal("9.50"), new Prisma.Decimal(10)).toFixed(2)).toBe("0.86");
    expect(taxIncluded(new Prisma.Decimal("2.50"), new Prisma.Decimal(21)).toFixed(2)).toBe("0.43");
  });

  it("rounds to cents without binary floating point errors", () => {
    expect(cents(new Prisma.Decimal("0.125")).toFixed(2)).toBe("0.13");
    expect(cents(new Prisma.Decimal("0.1").mul(3)).toFixed(2)).toBe("0.30");
  });
});
