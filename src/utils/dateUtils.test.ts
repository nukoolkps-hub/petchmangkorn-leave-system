import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addDaysYmd,
  countWorkdays,
  dateRange,
  fmtThaiDateTime,
  formatDayListThai,
  formatTenure,
  formatYmThai,
  isFuture,
  isPast,
  toYMD,
} from "./dateUtils";

describe("toYMD", () => {
  it("formats a Date to local YYYY-MM-DD with zero padding", () => {
    expect(toYMD(new Date(2026, 0, 3))).toBe("2026-01-03");
    expect(toYMD(new Date(2026, 5, 21))).toBe("2026-06-21");
  });
});

describe("addDaysYmd", () => {
  it("adds days, crossing month boundaries", () => {
    expect(addDaysYmd("2026-06-21", 1)).toBe("2026-06-22");
    expect(addDaysYmd("2026-06-30", 1)).toBe("2026-07-01");
  });

  it("supports negative offsets", () => {
    expect(addDaysYmd("2026-06-01", -1)).toBe("2026-05-31");
  });
});

describe("formatYmThai", () => {
  it("renders Thai month + Buddhist-era year", () => {
    expect(formatYmThai("2026-06")).toBe("มิถุนายน 2569");
    expect(formatYmThai("2026-01")).toBe("มกราคม 2569");
  });

  it("returns empty string for malformed input", () => {
    expect(formatYmThai("")).toBe("");
    expect(formatYmThai("2026")).toBe("");
    expect(formatYmThai("nope")).toBe("");
  });
});

describe("formatTenure", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0)); // 15 June 2026
  });
  afterEach(() => vi.useRealTimers());

  it("returns empty string for missing/invalid start month", () => {
    expect(formatTenure(null)).toBe("");
    expect(formatTenure("2026")).toBe("");
  });

  it('says "เพิ่งเริ่มงาน" when started this very month', () => {
    expect(formatTenure("2026-06")).toBe("เพิ่งเริ่มงาน");
  });

  it("renders months-only, years-only, and combined forms", () => {
    expect(formatTenure("2026-05")).toBe("1 เดือน");
    expect(formatTenure("2023-06")).toBe("3 ปี");
    expect(formatTenure("2024-03")).toBe("2 ปี 3 เดือน");
  });
});

describe("countWorkdays", () => {
  it("returns 0 for empty or reversed ranges", () => {
    expect(countWorkdays("", "2026-06-10")).toBe(0);
    expect(countWorkdays("2026-06-12", "2026-06-08")).toBe(0);
  });

  it("counts Mon–Fri as working days", () => {
    expect(countWorkdays("2026-06-08", "2026-06-12")).toBe(5);
  });

  it("skips the default-closed Saturday but counts the open Sunday", () => {
    // Sat 06 closed (not counted), Sun 07 open by default (counted)
    expect(countWorkdays("2026-06-06", "2026-06-07")).toBe(1);
  });

  it("counts a specially-opened Saturday", () => {
    expect(
      countWorkdays("2026-06-06", "2026-06-06", {
        extraOpenSaturdays: ["2026-06-06"],
      }),
    ).toBe(1);
  });

  it("excludes an admin-closed weekday and Sunday", () => {
    expect(
      countWorkdays("2026-06-07", "2026-06-08", {
        extraClosedSundays: ["2026-06-07"],
        extraClosedWeekdays: ["2026-06-08"],
      }),
    ).toBe(0);
  });
});

describe("dateRange", () => {
  it("lists every day inclusive", () => {
    expect(dateRange("2026-06-08", "2026-06-10")).toEqual([
      "2026-06-08",
      "2026-06-09",
      "2026-06-10",
    ]);
  });

  it("returns a single-element list when start == end", () => {
    expect(dateRange("2026-06-08", "2026-06-08")).toEqual(["2026-06-08"]);
  });

  it("returns an empty list when end precedes start", () => {
    expect(dateRange("2026-06-10", "2026-06-08")).toEqual([]);
  });
});

describe("fmtThaiDateTime", () => {
  it("renders a Thai date-time from epoch ms (built from local components)", () => {
    const ms = new Date(2026, 5, 11, 23, 58).getTime();
    expect(fmtThaiDateTime(ms)).toBe("11 มิถุนายน 2569 · 23:58 น.");
  });

  it("returns an em dash for a falsy timestamp", () => {
    expect(fmtThaiDateTime(0)).toBe("—");
  });
});

describe("isPast / isFuture", () => {
  it("compares plainly against today's date string", () => {
    expect(isPast("2000-01-01")).toBe(true);
    expect(isFuture("2999-12-31")).toBe(true);
    expect(isPast("2999-12-31")).toBe(false);
    expect(isFuture("2000-01-01")).toBe(false);
  });
});

describe("formatDayListThai — กางดูว่าไปแทนวันไหนบ้าง", () => {
  it("เดือนเดียว → พูดชื่อเดือนครั้งเดียว", () => {
    expect(formatDayListThai(["2026-09-03", "2026-09-08", "2026-09-15"])).toBe(
      "3, 8, 15 ก.ย.",
    );
  });

  it("ข้ามเดือน → แยกกลุ่มตามเดือน", () => {
    expect(formatDayListThai(["2026-09-28", "2026-10-02", "2026-10-05"])).toBe(
      "28 ก.ย. · 2, 5 ต.ค.",
    );
  });

  it("กลับมาเดือนเดิมทีหลัง = คนละกลุ่ม (คงลำดับตามที่ส่งมา ไม่จัดใหม่)", () => {
    expect(formatDayListThai(["2026-09-01", "2026-10-01", "2026-09-30"])).toBe(
      "1 ก.ย. · 1 ต.ค. · 30 ก.ย.",
    );
  });

  it("ลิสต์ว่าง / ค่าเพี้ยน → ไม่พัง", () => {
    expect(formatDayListThai([])).toBe("");
    expect(formatDayListThai([""])).toBe("");
  });

  it("วันเดียว", () => {
    expect(formatDayListThai(["2026-01-09"])).toBe("9 ม.ค.");
  });
});
