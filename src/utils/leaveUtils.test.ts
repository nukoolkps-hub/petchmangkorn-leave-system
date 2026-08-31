import { describe, expect, it } from "vitest";
import { BUSINESS_RULES } from "../constants";
import type { StoreCalendar } from "../types";
import {
  countWeekdayLeaves,
  getAdditionalDeduction,
  getLeaveDeduction,
  getMonthlySettlement,
  getOverQuotaDays,
  getRequestImpact,
  hasPerfectAttendance,
  leaveOverlapsMonth,
} from "./leaveUtils";

// June 2026: Mon 08 → Fri 12 are five consecutive weekdays.
// Sat 06 / Sat 13 are Saturdays; Sun 07 / Sun 14 are Sundays.

describe("countWeekdayLeaves", () => {
  it("counts each weekday within a multi-day leave", () => {
    expect(
      countWeekdayLeaves([{ start: "2026-06-08", end: "2026-06-12" }]),
    ).toBe(5);
  });

  it("skips Saturdays (closed by default) and Sundays", () => {
    // Sat 06 + Sun 07 only
    expect(
      countWeekdayLeaves([{ start: "2026-06-06", end: "2026-06-07" }]),
    ).toBe(0);
  });

  it("counts a specially-opened Saturday as a weekday", () => {
    const cal = { extraOpenSaturdays: ["2026-06-06"] } as StoreCalendar;
    expect(
      countWeekdayLeaves([{ start: "2026-06-06", end: "2026-06-06" }], cal),
    ).toBe(1);
  });
});

describe("getOverQuotaDays", () => {
  it("gives only the first weekday leave day free (quota = 1)", () => {
    // Mon 08 alone → still inside the 1-day quota
    expect(
      getOverQuotaDays([{ start: "2026-06-08", end: "2026-06-08" }]),
    ).toEqual({ weekdays: 0, sundays: 0 });
    // Mon 08 + Tue 09 → the second day is already over quota
    expect(
      getOverQuotaDays([{ start: "2026-06-08", end: "2026-06-09" }]),
    ).toEqual({ weekdays: 1, sundays: 0 });
  });

  it("charges weekday days beyond the 1-day quota", () => {
    // Mon–Fri = 5 weekdays → 5 - 1 = 4 over quota
    expect(
      getOverQuotaDays([{ start: "2026-06-08", end: "2026-06-12" }]),
    ).toEqual({ weekdays: 4, sundays: 0 });
  });

  it("counts a long single leave by DAY, not by entry (no full-month free ride)", () => {
    // one entry spanning 5 weekdays must still cost 4 over-quota days
    const res = getOverQuotaDays([{ start: "2026-06-08", end: "2026-06-12" }]);
    expect(res.weekdays).toBe(4);
  });

  it("dedupes overlapping leave entries so a day is not double-counted", () => {
    const res = getOverQuotaDays([
      { start: "2026-06-08", end: "2026-06-10" },
      { start: "2026-06-09", end: "2026-06-12" }, // overlaps 09–10
    ]);
    // union = Mon..Fri = 5 unique weekdays → 4 over quota
    expect(res).toEqual({ weekdays: 4, sundays: 0 });
  });

  it("charges every Sunday immediately (no quota) when the store is open", () => {
    const res = getOverQuotaDays([{ start: "2026-06-07", end: "2026-06-07" }]);
    expect(res).toEqual({ weekdays: 0, sundays: 1 });
  });

  it("does not charge a Sunday the admin marked as closed", () => {
    const cal = { extraClosedSundays: ["2026-06-07"] } as StoreCalendar;
    const res = getOverQuotaDays(
      [{ start: "2026-06-07", end: "2026-06-07" }],
      cal,
    );
    expect(res).toEqual({ weekdays: 0, sundays: 0 });
  });

  it("ignores closed Saturdays entirely", () => {
    const res = getOverQuotaDays([{ start: "2026-06-06", end: "2026-06-06" }]);
    expect(res).toEqual({ weekdays: 0, sundays: 0 });
  });

  it("separates weekday and Sunday charges across a week-long leave", () => {
    // Mon 08 → Sun 14: weekdays Mon-Fri (5) → 4 over quota; Sat 13 closed; Sun 14 charged
    const res = getOverQuotaDays([{ start: "2026-06-08", end: "2026-06-14" }]);
    expect(res).toEqual({ weekdays: 4, sundays: 1 });
  });
});

// ── Cross-month leave: clamp + overlap (bug fix) ──
// Leave Fri 29 May → Wed 03 Jun 2026:
//   May 29 Fri (weekday) · May 30 Sat (closed) · May 31 Sun (charged)
//   Jun 01 Mon · Jun 02 Tue · Jun 03 Wed (weekdays)
describe("cross-month leave clamping", () => {
  const crossLeave = [{ start: "2026-05-29", end: "2026-06-03" }];

  it("leaveOverlapsMonth matches both touched months, not others", () => {
    expect(leaveOverlapsMonth(crossLeave[0], "2026-05")).toBe(true);
    expect(leaveOverlapsMonth(crossLeave[0], "2026-06")).toBe(true);
    expect(leaveOverlapsMonth(crossLeave[0], "2026-04")).toBe(false);
    expect(leaveOverlapsMonth(crossLeave[0], "2026-07")).toBe(false);
  });

  it("countWeekdayLeaves clamps to the given month", () => {
    // May: only Fri 29 → 1
    expect(countWeekdayLeaves(crossLeave, null, "2026-05")).toBe(1);
    // June: Mon 01, Tue 02, Wed 03 → 3
    expect(countWeekdayLeaves(crossLeave, null, "2026-06")).toBe(3);
    // no clamp (legacy) → counts the whole range = 1 + 3 = 4
    expect(countWeekdayLeaves(crossLeave, null)).toBe(4);
  });

  it("getOverQuotaDays clamps to the given month (each month its own days)", () => {
    // May: 1 weekday (exactly the 1-day quota) + Sun 31 charged
    expect(getOverQuotaDays(crossLeave, null, "2026-05")).toEqual({
      weekdays: 0,
      sundays: 1,
    });
    // June: 3 weekdays → 2 over quota, no Sunday
    expect(getOverQuotaDays(crossLeave, null, "2026-06")).toEqual({
      weekdays: 2,
      sundays: 0,
    });
  });
});

// ── ค่าหักเงิน ──────────────────────────────────────────────────
// อัตราอ่านจาก BUSINESS_RULES เพื่อให้เทสต์ไม่พังตอนร้านปรับราคา —
// สิ่งที่ล็อกไว้คือ "จำนวนวันที่ถูกหัก" ไม่ใช่ตัวเลขบาทที่ hardcode
const WEEKDAY_RATE = BUSINESS_RULES.OVER_QUOTA_WEEKDAY_DEDUCTION;
const SUNDAY_RATE = BUSINESS_RULES.SUNDAY_LEAVE_DEDUCTION;

describe("getLeaveDeduction", () => {
  it("charges nothing when the leave stays inside the quota", () => {
    expect(
      getLeaveDeduction([{ start: "2026-06-08", end: "2026-06-08" }]),
    ).toEqual({
      weekdayDays: 0,
      sundayDays: 0,
      weekdayAmount: 0,
      sundayAmount: 0,
      total: 0,
    });
  });

  it("charges the weekday rate for each day past the quota", () => {
    // Mon 08 free (quota), Tue 09 charged
    const res = getLeaveDeduction([{ start: "2026-06-08", end: "2026-06-09" }]);
    expect(res.weekdayDays).toBe(1);
    expect(res.weekdayAmount).toBe(WEEKDAY_RATE);
    expect(res.total).toBe(WEEKDAY_RATE);
  });

  it("charges the Sunday rate from the very first Sunday — quota does not apply", () => {
    // Mon 08 กินโควต้าไป (ไม่ถูกหัก) แต่ Sun 07 ยังโดนเต็มอัตรา
    // (โควต้าวันธรรมดาไม่ช่วยวันอาทิตย์ · และมีวันธรรมดาแล้ว → ไม่เข้ากฎผ่อนผัน)
    const res = getLeaveDeduction(
      [
        { start: "2026-06-07", end: "2026-06-07" },
        { start: "2026-06-08", end: "2026-06-08" },
      ],
      null,
      "2026-06",
    );
    expect(res.weekdayDays).toBe(0);
    expect(res.weekdayAmount).toBe(0);
    expect(res.sundayDays).toBe(1);
    expect(res.sundayAmount).toBe(SUNDAY_RATE);
  });

  it("adds both kinds of charge together", () => {
    // Mon 08 → Sun 14: 4 weekdays over quota + 1 Sunday
    const res = getLeaveDeduction([{ start: "2026-06-08", end: "2026-06-14" }]);
    expect(res.weekdayAmount).toBe(4 * WEEKDAY_RATE);
    expect(res.sundayAmount).toBe(SUNDAY_RATE);
    expect(res.total).toBe(4 * WEEKDAY_RATE + SUNDAY_RATE);
  });

  it("charges nothing for days the store is closed", () => {
    // Sat 06 closed by default + Sun 07 marked closed by admin
    const cal = { extraClosedSundays: ["2026-06-07"] } as StoreCalendar;
    const res = getLeaveDeduction(
      [{ start: "2026-06-06", end: "2026-06-07" }],
      cal,
    );
    expect(res.total).toBe(0);
  });

  it("keeps each month's quota separate for a cross-month leave", () => {
    const crossLeave = [{ start: "2026-05-29", end: "2026-06-03" }];
    // May: Fri 29 uses the quota, Sun 31 charged
    expect(getLeaveDeduction(crossLeave, null, "2026-05").total).toBe(
      SUNDAY_RATE,
    );
    // June: Mon–Wed = 3 weekdays → 2 over quota
    expect(getLeaveDeduction(crossLeave, null, "2026-06").total).toBe(
      2 * WEEKDAY_RATE,
    );
  });
});

describe("getAdditionalDeduction", () => {
  it("is free when the month's quota has not been used yet", () => {
    const res = getAdditionalDeduction([], {
      start: "2026-06-08",
      end: "2026-06-08",
    });
    expect(res.total).toBe(0);
  });

  it("charges the first weekday once the quota is already spent", () => {
    // Mon 08 already taken → Tue 09 costs the weekday rate
    const res = getAdditionalDeduction(
      [{ start: "2026-06-08", end: "2026-06-08" }],
      { start: "2026-06-09", end: "2026-06-09" },
    );
    expect(res.weekdayDays).toBe(1);
    expect(res.total).toBe(WEEKDAY_RATE);
  });

  it("charges a Sunday even when the quota is untouched", () => {
    // อาทิตย์ไม่ใช้โควต้าวันธรรมดา — ลาวันเดียวโดยไม่แตะวันธรรมดาเข้ากฎผ่อนผัน
    const res = getAdditionalDeduction([], {
      start: "2026-06-07",
      end: "2026-06-07",
    });
    expect(res.sundayDays).toBe(1);
    expect(res.total).toBe(BUSINESS_RULES.SINGLE_SUNDAY_ONLY_DEDUCTION);
  });

  it("only bills the increment the new leave adds, not the existing total", () => {
    // existing Mon–Wed already costs 2 over-quota days;
    // adding Thu 11 must bill exactly 1 more day, not 3
    const existing = [{ start: "2026-06-08", end: "2026-06-10" }];
    const res = getAdditionalDeduction(existing, {
      start: "2026-06-11",
      end: "2026-06-11",
    });
    expect(res.weekdayDays).toBe(1);
    expect(res.total).toBe(WEEKDAY_RATE);
  });

  it("does not double-bill a day that overlaps an existing leave", () => {
    const existing = [{ start: "2026-06-08", end: "2026-06-10" }];
    const res = getAdditionalDeduction(existing, {
      start: "2026-06-09",
      end: "2026-06-10",
    });
    expect(res.total).toBe(0);
  });

  it("spreads a cross-month request across both months' quotas", () => {
    // Fri 29 May → Wed 03 Jun with nothing booked yet:
    // May → Fri 29 free (quota) + Sun 31 charged · June → 3 weekdays, 2 over quota
    const res = getAdditionalDeduction([], {
      start: "2026-05-29",
      end: "2026-06-03",
    });
    expect(res.sundayDays).toBe(1);
    expect(res.weekdayDays).toBe(2);
    expect(res.total).toBe(SUNDAY_RATE + 2 * WEEKDAY_RATE);
  });

  it("returns nothing for an incomplete or reversed date range", () => {
    expect(getAdditionalDeduction([], { start: "", end: "" }).total).toBe(0);
    expect(
      getAdditionalDeduction([], { start: "2026-06-10", end: "2026-06-08" })
        .total,
    ).toBe(0);
  });
});

// ── กฎผ่อนผัน: อาทิตย์วันเดียว + ไม่ลาวันธรรมดาเลย ──────────────
const SINGLE_SUNDAY_RATE = BUSINESS_RULES.SINGLE_SUNDAY_ONLY_DEDUCTION;
const BONUS = BUSINESS_RULES.PERFECT_ATTENDANCE_BONUS;

describe("single-Sunday concession", () => {
  it("charges the reduced rate for one Sunday with no weekday leave", () => {
    // Sun 07 only
    const res = getLeaveDeduction(
      [{ start: "2026-06-07", end: "2026-06-07" }],
      null,
      "2026-06",
    );
    expect(res.sundayDays).toBe(1);
    expect(res.sundayAmount).toBe(SINGLE_SUNDAY_RATE);
    expect(res.total).toBe(SINGLE_SUNDAY_RATE);
  });

  it("falls back to the full rate on every Sunday once there are two", () => {
    // Sun 07 + Sun 14 → ไม่ใช่ 200 + 500 แต่เป็น 500 × 2
    const res = getLeaveDeduction(
      [
        { start: "2026-06-07", end: "2026-06-07" },
        { start: "2026-06-14", end: "2026-06-14" },
      ],
      null,
      "2026-06",
    );
    expect(res.sundayDays).toBe(2);
    expect(res.sundayAmount).toBe(2 * SUNDAY_RATE);
  });

  it("does not apply when a weekday was also taken — even inside the quota", () => {
    // Mon 08 ใช้โควต้า (ไม่ถูกหัก) แต่ยังถือว่า "ลาวันธรรมดา" → อาทิตย์คิดเต็ม
    const res = getLeaveDeduction(
      [
        { start: "2026-06-07", end: "2026-06-07" },
        { start: "2026-06-08", end: "2026-06-08" },
      ],
      null,
      "2026-06",
    );
    expect(res.weekdayAmount).toBe(0); // วันธรรมดายังอยู่ในโควต้า
    expect(res.sundayAmount).toBe(SUNDAY_RATE);
    expect(res.total).toBe(SUNDAY_RATE);
  });

  it("ignores leave on a Sunday the store is closed", () => {
    const cal = { extraClosedSundays: ["2026-06-07"] } as StoreCalendar;
    const res = getLeaveDeduction(
      [{ start: "2026-06-07", end: "2026-06-07" }],
      cal,
      "2026-06",
    );
    expect(res.total).toBe(0);
  });

  it("judges each month on its own for a cross-month leave", () => {
    // May: Fri 29 (weekday) + Sun 31 → มีวันธรรมดา → อาทิตย์คิดเต็ม
    const crossLeave = [{ start: "2026-05-29", end: "2026-06-03" }];
    expect(getLeaveDeduction(crossLeave, null, "2026-05").sundayAmount).toBe(
      SUNDAY_RATE,
    );
  });
});

// ── โบนัสไม่ลาทั้งเดือน ────────────────────────────────────────
describe("hasPerfectAttendance / getMonthlySettlement", () => {
  it("pays the bonus when the month has no leave at all", () => {
    const res = getMonthlySettlement([], null, "2026-06");
    expect(res.bonus).toBe(BONUS);
    expect(res.deduction.total).toBe(0);
    expect(res.net).toBe(BONUS);
  });

  it("keeps the bonus when the only leave falls on days the store is closed", () => {
    // Sat 06 ปิดตามปกติ → ไม่นับเป็นวันลา
    const res = getMonthlySettlement(
      [{ start: "2026-06-06", end: "2026-06-06" }],
      null,
      "2026-06",
    );
    expect(res.bonus).toBe(BONUS);
    expect(res.net).toBe(BONUS);
  });

  it("loses the bonus on a single weekday leave, even inside the quota", () => {
    const res = getMonthlySettlement(
      [{ start: "2026-06-08", end: "2026-06-08" }],
      null,
      "2026-06",
    );
    expect(res.bonus).toBe(0);
    expect(res.deduction.total).toBe(0); // อยู่ในโควต้า ไม่ถูกหัก
    expect(res.net).toBe(0); // แต่ก็ไม่ได้โบนัส
  });

  it("nets the concession rate against the lost bonus for one Sunday", () => {
    const res = getMonthlySettlement(
      [{ start: "2026-06-07", end: "2026-06-07" }],
      null,
      "2026-06",
    );
    expect(res.bonus).toBe(0);
    expect(res.net).toBe(-SINGLE_SUNDAY_RATE);
  });

  it("only counts the month asked for", () => {
    const may = [{ start: "2026-05-11", end: "2026-05-11" }];
    expect(hasPerfectAttendance(may, null, "2026-05")).toBe(false);
    expect(hasPerfectAttendance(may, null, "2026-06")).toBe(true);
  });
});

// ── ผลกระทบของใบลาใบใหม่ (ฟอร์มยื่นลา) ─────────────────────────
describe("getRequestImpact", () => {
  it("counts the lost bonus when the month was still clean", () => {
    // ยังไม่เคยลาเดือนนี้ → ลาวันธรรมดา 1 วัน: ไม่ถูกหัก แต่เสียโบนัส
    const res = getRequestImpact([], {
      start: "2026-06-08",
      end: "2026-06-08",
    });
    expect(res.deduction.total).toBe(0);
    expect(res.bonusLost).toBe(BONUS);
    expect(res.total).toBe(BONUS);
  });

  it("does not charge the bonus twice once it is already lost", () => {
    const existing = [{ start: "2026-06-08", end: "2026-06-08" }];
    const res = getRequestImpact(existing, {
      start: "2026-06-09",
      end: "2026-06-09",
    });
    expect(res.bonusLost).toBe(0);
    expect(res.deduction.total).toBe(WEEKDAY_RATE); // วันที่ 2 เกินโควต้า
    expect(res.total).toBe(WEEKDAY_RATE);
  });

  it("adds the concession charge and the lost bonus for one Sunday", () => {
    const res = getRequestImpact([], {
      start: "2026-06-07",
      end: "2026-06-07",
    });
    expect(res.deduction.total).toBe(SINGLE_SUNDAY_RATE);
    expect(res.bonusLost).toBe(BONUS);
    expect(res.total).toBe(SINGLE_SUNDAY_RATE + BONUS);
  });

  it("keeps the bonus when the request only covers closed days", () => {
    const res = getRequestImpact([], {
      start: "2026-06-06",
      end: "2026-06-06",
    });
    expect(res.total).toBe(0);
  });

  it("loses the bonus in both months for a cross-month request", () => {
    const res = getRequestImpact([], {
      start: "2026-05-29",
      end: "2026-06-03",
    });
    expect(res.bonusLost).toBe(2 * BONUS);
  });
});
