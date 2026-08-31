import { describe, expect, it } from "vitest";
import {
  getPeriodRange,
  isCalendarMonth,
  isInPeriod,
  isPeriodClosed,
  lastDayOfMonth,
  periodKeyForDate,
  periodKeysInRange,
  prevYearMonth,
} from "./payrollPeriod";

describe("prevYearMonth / lastDayOfMonth", () => {
  it("steps back a month and wraps the year", () => {
    expect(prevYearMonth("2026-06")).toBe("2026-05");
    expect(prevYearMonth("2026-01")).toBe("2025-12");
  });

  it("knows month lengths including February in a leap year", () => {
    expect(lastDayOfMonth("2026-06")).toBe("2026-06-30");
    expect(lastDayOfMonth("2026-07")).toBe("2026-07-31");
    expect(lastDayOfMonth("2026-02")).toBe("2026-02-28");
    expect(lastDayOfMonth("2028-02")).toBe("2028-02-29");
  });
});

describe("getPeriodRange", () => {
  it("falls back to the whole calendar month with no cutoffs", () => {
    expect(getPeriodRange("2026-08", null)).toEqual({
      start: "2026-08-01",
      end: "2026-08-31",
    });
  });

  it("ends on the cutoff day once the month is closed", () => {
    const cutoffs = { "2026-08": "2026-08-27" };
    expect(getPeriodRange("2026-08", cutoffs).end).toBe("2026-08-27");
  });

  it("starts the next period on the day after the previous cutoff", () => {
    const cutoffs = { "2026-08": "2026-08-27" };
    // รอบ ก.ย. ต้องเริ่ม 28 ส.ค. — วันลา 28-31 ส.ค. ตกมารอบนี้
    expect(getPeriodRange("2026-09", cutoffs)).toEqual({
      start: "2026-08-28",
      end: "2026-09-30",
    });
  });

  it("chains two closed periods without gaps or overlaps", () => {
    const cutoffs = { "2026-07": "2026-07-26", "2026-08": "2026-08-27" };
    const jul = getPeriodRange("2026-07", cutoffs);
    const aug = getPeriodRange("2026-08", cutoffs);
    expect(jul.end).toBe("2026-07-26");
    expect(aug.start).toBe("2026-07-27"); // ต่อกันพอดี ไม่มีวันหล่น
    expect(aug.end).toBe("2026-08-27");
  });

  it("handles a cutoff on the last day of the month", () => {
    const cutoffs = { "2026-08": "2026-08-31" };
    expect(getPeriodRange("2026-09", cutoffs).start).toBe("2026-09-01");
  });

  it("crosses the year boundary", () => {
    const cutoffs = { "2025-12": "2025-12-28" };
    expect(getPeriodRange("2026-01", cutoffs).start).toBe("2025-12-29");
  });
});

describe("isPeriodClosed / isCalendarMonth / isInPeriod", () => {
  it("reports closed only for months with a saved cutoff", () => {
    const cutoffs = { "2026-08": "2026-08-27" };
    expect(isPeriodClosed("2026-08", cutoffs)).toBe(true);
    expect(isPeriodClosed("2026-09", cutoffs)).toBe(false);
    expect(isPeriodClosed("2026-08", null)).toBe(false);
  });

  it("detects when a period is just the plain calendar month", () => {
    expect(isCalendarMonth("2026-08", getPeriodRange("2026-08", null))).toBe(
      true,
    );
    expect(
      isCalendarMonth(
        "2026-09",
        getPeriodRange("2026-09", { "2026-08": "2026-08-27" }),
      ),
    ).toBe(false);
  });

  it("includes both ends of the range", () => {
    const period = { start: "2026-08-28", end: "2026-09-27" };
    expect(isInPeriod("2026-08-28", period)).toBe(true);
    expect(isInPeriod("2026-09-27", period)).toBe(true);
    expect(isInPeriod("2026-08-27", period)).toBe(false);
    expect(isInPeriod("2026-09-28", period)).toBe(false);
  });
});

describe("periodKeyForDate / periodKeysInRange", () => {
  const cutoffs = { "2026-08": "2026-08-27" };

  it("keeps a date on or before the cutoff in its own month", () => {
    expect(periodKeyForDate("2026-08-27", cutoffs)).toBe("2026-08");
    expect(periodKeyForDate("2026-08-01", cutoffs)).toBe("2026-08");
  });

  it("pushes a date after the cutoff into the next period", () => {
    expect(periodKeyForDate("2026-08-28", cutoffs)).toBe("2026-09");
    expect(periodKeyForDate("2026-08-31", cutoffs)).toBe("2026-09");
  });

  it("wraps to January when December is closed early", () => {
    expect(periodKeyForDate("2025-12-30", { "2025-12": "2025-12-28" })).toBe(
      "2026-01",
    );
  });

  it("uses the plain month when nothing is closed", () => {
    expect(periodKeyForDate("2026-08-31", null)).toBe("2026-08");
  });

  it("splits a leave that straddles the cutoff into two periods", () => {
    // ลา 26-30 ส.ค. · ปิดรอบ 27 → 26-27 อยู่รอบ ส.ค. · 28-30 อยู่รอบ ก.ย.
    expect(periodKeysInRange("2026-08-26", "2026-08-30", cutoffs)).toEqual([
      "2026-08",
      "2026-09",
    ]);
  });

  it("returns a single period when the leave sits fully inside one", () => {
    expect(periodKeysInRange("2026-08-10", "2026-08-12", cutoffs)).toEqual([
      "2026-08",
    ]);
  });

  it("returns nothing for an empty or reversed range", () => {
    expect(periodKeysInRange("", "", cutoffs)).toEqual([]);
    expect(periodKeysInRange("2026-08-10", "2026-08-01", cutoffs)).toEqual([]);
  });
});
