import { describe, expect, it } from "vitest";
import type { StoreCalendar } from "../types";
import {
  dateToYmd,
  isQuotaCountableDay,
  isStoreClosed,
  isSunday,
  ymdToDate,
} from "./storeCalendar";

// Reference dates (June 2026): Fri 05, Sat 06, Sun 07, Mon 08, Sat 13, Sun 14
const FRI = "2026-06-05";
const SAT = "2026-06-06";
const SUN = "2026-06-07";
const MON = "2026-06-08";

describe("isStoreClosed", () => {
  it("treats Saturday as closed by default", () => {
    expect(isStoreClosed(SAT)).toBe(true);
    expect(isStoreClosed(SAT, null)).toBe(true);
    expect(isStoreClosed(SAT, {} as StoreCalendar)).toBe(true);
  });

  it("opens a Saturday listed in extraOpenSaturdays", () => {
    const cal = { extraOpenSaturdays: [SAT] } as StoreCalendar;
    expect(isStoreClosed(SAT, cal)).toBe(false);
    // a different Saturday stays closed
    expect(isStoreClosed("2026-06-13", cal)).toBe(true);
  });

  it("treats Sunday as open by default but closes it when admin marks it", () => {
    expect(isStoreClosed(SUN)).toBe(false);
    const cal = { extraClosedSundays: [SUN] } as StoreCalendar;
    expect(isStoreClosed(SUN, cal)).toBe(true);
  });

  it("treats weekdays as open by default but closes admin-marked ones", () => {
    expect(isStoreClosed(MON)).toBe(false);
    expect(isStoreClosed(FRI)).toBe(false);
    const cal = { extraClosedWeekdays: [MON] } as StoreCalendar;
    expect(isStoreClosed(MON, cal)).toBe(true);
    expect(isStoreClosed(FRI, cal)).toBe(false);
  });
});

describe("isQuotaCountableDay", () => {
  it("counts open weekdays", () => {
    expect(isQuotaCountableDay(MON)).toBe(true);
    expect(isQuotaCountableDay(FRI)).toBe(true);
  });

  it("never counts Sunday (separate ×1.5 rule), even when the store is open", () => {
    expect(isQuotaCountableDay(SUN)).toBe(false);
  });

  it("does not count a default-closed Saturday", () => {
    expect(isQuotaCountableDay(SAT)).toBe(false);
  });

  it("counts a specially-opened Saturday like a weekday", () => {
    const cal = { extraOpenSaturdays: [SAT] } as StoreCalendar;
    expect(isQuotaCountableDay(SAT, cal)).toBe(true);
  });

  it("does not count an admin-closed weekday", () => {
    const cal = { extraClosedWeekdays: [MON] } as StoreCalendar;
    expect(isQuotaCountableDay(MON, cal)).toBe(false);
  });
});

describe("isSunday", () => {
  it("identifies Sundays only", () => {
    expect(isSunday(SUN)).toBe(true);
    expect(isSunday(SAT)).toBe(false);
    expect(isSunday(MON)).toBe(false);
  });
});

describe("ymdToDate / dateToYmd round-trip", () => {
  it("parses to local midnight and formats back", () => {
    const d = ymdToDate(FRI);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5); // June (0-indexed)
    expect(d.getDate()).toBe(5);
    expect(d.getHours()).toBe(0);
    expect(dateToYmd(d)).toBe(FRI);
  });

  it("zero-pads month and day", () => {
    expect(dateToYmd(new Date(2026, 0, 3))).toBe("2026-01-03");
  });
});
