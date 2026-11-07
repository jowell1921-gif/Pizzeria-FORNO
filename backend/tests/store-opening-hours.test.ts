import { describe, expect, it } from "vitest";

import {
  isOpenAt,
  localTime,
  type SpecialDay,
  type WeeklySlot,
} from "../src/modules/store/opening-hours.js";

const TZ = "Europe/Madrid";
/** Martes a domingo de 13:00 a 16:00 (ejemplo); el lunes cierra. */
const weekly: WeeklySlot[] = [2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({
  dayOfWeek,
  openMinute: 13 * 60,
  closeMinute: 16 * 60,
}));

describe("localTime", () => {
  it("converts to the store time zone, including the date change", () => {
    // 22:30 UTC del martes 10 de noviembre de 2026 = 23:30 en Madrid (invierno, UTC+1).
    expect(localTime(new Date("2026-11-10T22:30:00Z"), TZ)).toEqual({
      date: "2026-11-10",
      isoDay: 2,
      minute: 23 * 60 + 30,
    });
    // 23:30 UTC ya es el miércoles en Madrid.
    expect(localTime(new Date("2026-11-10T23:30:00Z"), TZ)).toMatchObject({
      date: "2026-11-11",
      isoDay: 3,
      minute: 30,
    });
  });

  it("handles summer time (UTC+2)", () => {
    expect(localTime(new Date("2026-07-14T11:00:00Z"), TZ)).toMatchObject({
      isoDay: 2,
      minute: 13 * 60,
    });
  });
});

describe("isOpenAt", () => {
  it("is open inside a slot and closed outside, with an exclusive closing minute", () => {
    expect(isOpenAt(new Date("2026-11-10T12:00:00Z"), TZ, weekly, [])).toBe(true); // 13:00
    expect(isOpenAt(new Date("2026-11-10T11:59:00Z"), TZ, weekly, [])).toBe(false); // 12:59
    expect(isOpenAt(new Date("2026-11-10T14:59:00Z"), TZ, weekly, [])).toBe(true); // 15:59
    expect(isOpenAt(new Date("2026-11-10T15:00:00Z"), TZ, weekly, [])).toBe(false); // 16:00
  });

  it("is closed on days without a slot", () => {
    expect(isOpenAt(new Date("2026-11-09T14:00:00Z"), TZ, weekly, [])).toBe(false); // lunes
  });

  it("lets a special day replace the weekly schedule", () => {
    const closed: SpecialDay[] = [
      { date: "2026-11-10", closed: true, openMinute: null, closeMinute: null },
    ];
    expect(isOpenAt(new Date("2026-11-10T13:00:00Z"), TZ, weekly, closed)).toBe(false);

    const monday: SpecialDay[] = [
      { date: "2026-11-09", closed: false, openMinute: 10 * 60, closeMinute: 12 * 60 },
    ];
    expect(isOpenAt(new Date("2026-11-09T10:30:00Z"), TZ, weekly, monday)).toBe(true); // 11:30
    expect(isOpenAt(new Date("2026-11-09T13:00:00Z"), TZ, weekly, monday)).toBe(false);
  });
});
