import { describe, expect, it } from "vitest";
import { BUSINESS_RULES } from "../constants";
import type { StoreCalendar } from "../types";
import {
  countWeekdayLeaves,
  getAdditionalDeduction,
  getDeductibleLeaveDays,
  getLeaveBonus,
  getLeaveDeduction,
  getMonthlySettlement,
  getRequestImpact,
  hasNoWeekdayLeave,
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

describe("getDeductibleLeaveDays", () => {
  it("charges every weekday leave day — there is no free day", () => {
    expect(
      getDeductibleLeaveDays([{ start: "2026-06-08", end: "2026-06-08" }]),
    ).toEqual({ weekdays: 1, sundays: 0 });
    expect(
      getDeductibleLeaveDays([{ start: "2026-06-08", end: "2026-06-09" }]),
    ).toEqual({ weekdays: 2, sundays: 0 });
  });

  it("counts a long single leave by DAY, not by entry", () => {
    // Mon–Fri in one entry must still cost 5 days
    expect(
      getDeductibleLeaveDays([{ start: "2026-06-08", end: "2026-06-12" }]),
    ).toEqual({ weekdays: 5, sundays: 0 });
  });

  it("dedupes overlapping leave entries so a day is not double-charged", () => {
    const res = getDeductibleLeaveDays([
      { start: "2026-06-08", end: "2026-06-10" },
      { start: "2026-06-09", end: "2026-06-12" }, // overlaps 09–10
    ]);
    // union = Mon..Fri = 5 unique weekdays
    expect(res).toEqual({ weekdays: 5, sundays: 0 });
  });

  it("counts Sundays separately when the store is open", () => {
    const res = getDeductibleLeaveDays([
      { start: "2026-06-07", end: "2026-06-07" },
    ]);
    expect(res).toEqual({ weekdays: 0, sundays: 1 });
  });

  it("does not count a Sunday the admin marked as closed", () => {
    const cal = { extraClosedSundays: ["2026-06-07"] } as StoreCalendar;
    const res = getDeductibleLeaveDays(
      [{ start: "2026-06-07", end: "2026-06-07" }],
      cal,
    );
    expect(res).toEqual({ weekdays: 0, sundays: 0 });
  });

  it("ignores closed Saturdays entirely", () => {
    const res = getDeductibleLeaveDays([
      { start: "2026-06-06", end: "2026-06-06" },
    ]);
    expect(res).toEqual({ weekdays: 0, sundays: 0 });
  });

  it("separates weekday and Sunday days across a week-long leave", () => {
    // Mon 08 → Sun 14: Mon-Fri (5) weekdays; Sat 13 closed; Sun 14 counted
    const res = getDeductibleLeaveDays([
      { start: "2026-06-08", end: "2026-06-14" },
    ]);
    expect(res).toEqual({ weekdays: 5, sundays: 1 });
  });
});

// ── Cross-month leave: clamp + overlap ──
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

  it("getDeductibleLeaveDays clamps to the given month", () => {
    expect(getDeductibleLeaveDays(crossLeave, null, "2026-05")).toEqual({
      weekdays: 1,
      sundays: 1,
    });
    expect(getDeductibleLeaveDays(crossLeave, null, "2026-06")).toEqual({
      weekdays: 3,
      sundays: 0,
    });
  });
});

// ── ค่าหักเงิน ──────────────────────────────────────────────────
// อัตราอ่านจาก BUSINESS_RULES เพื่อให้เทสต์ไม่พังตอนร้านปรับราคา —
// สิ่งที่ล็อกไว้คือ "จำนวนวันที่ถูกหัก" ไม่ใช่ตัวเลขบาทที่ hardcode
const WEEKDAY_RATE = BUSINESS_RULES.WEEKDAY_LEAVE_DEDUCTION;
const SUNDAY_RATE = BUSINESS_RULES.SUNDAY_LEAVE_DEDUCTION;
const WEEKDAY_BONUS = BUSINESS_RULES.NO_WEEKDAY_LEAVE_BONUS;
const TOPUP = BUSINESS_RULES.PERFECT_ATTENDANCE_TOPUP;
const FULL_BONUS = WEEKDAY_BONUS + TOPUP;

describe("getLeaveDeduction", () => {
  it("charges nothing when there is no leave", () => {
    expect(getLeaveDeduction([])).toEqual({
      weekdayDays: 0,
      sundayDays: 0,
      weekdayAmount: 0,
      sundayAmount: 0,
      total: 0,
    });
  });

  it("charges the weekday rate from the very first weekday", () => {
    const res = getLeaveDeduction([{ start: "2026-06-08", end: "2026-06-08" }]);
    expect(res.weekdayDays).toBe(1);
    expect(res.weekdayAmount).toBe(WEEKDAY_RATE);
    expect(res.total).toBe(WEEKDAY_RATE);
  });

  it("charges the Sunday rate from the very first Sunday", () => {
    const res = getLeaveDeduction(
      [{ start: "2026-06-07", end: "2026-06-07" }],
      null,
      "2026-06",
    );
    expect(res.sundayDays).toBe(1);
    expect(res.sundayAmount).toBe(SUNDAY_RATE);
    expect(res.total).toBe(SUNDAY_RATE);
  });

  it("charges every Sunday at the same rate — no concession for the first", () => {
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

  it("adds both kinds of charge together", () => {
    // Mon 08 → Sun 14: 5 weekdays + 1 Sunday
    const res = getLeaveDeduction([{ start: "2026-06-08", end: "2026-06-14" }]);
    expect(res.weekdayAmount).toBe(5 * WEEKDAY_RATE);
    expect(res.sundayAmount).toBe(SUNDAY_RATE);
    expect(res.total).toBe(5 * WEEKDAY_RATE + SUNDAY_RATE);
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

  it("keeps each month separate for a cross-month leave", () => {
    const crossLeave = [{ start: "2026-05-29", end: "2026-06-03" }];
    // May: Fri 29 weekday + Sun 31
    expect(getLeaveDeduction(crossLeave, null, "2026-05").total).toBe(
      WEEKDAY_RATE + SUNDAY_RATE,
    );
    // June: Mon–Wed = 3 weekdays
    expect(getLeaveDeduction(crossLeave, null, "2026-06").total).toBe(
      3 * WEEKDAY_RATE,
    );
  });
});

describe("getAdditionalDeduction", () => {
  it("charges the first weekday of a clean month", () => {
    const res = getAdditionalDeduction([], {
      start: "2026-06-08",
      end: "2026-06-08",
    });
    expect(res.weekdayDays).toBe(1);
    expect(res.total).toBe(WEEKDAY_RATE);
  });

  it("charges a Sunday at the Sunday rate", () => {
    const res = getAdditionalDeduction([], {
      start: "2026-06-07",
      end: "2026-06-07",
    });
    expect(res.sundayDays).toBe(1);
    expect(res.total).toBe(SUNDAY_RATE);
  });

  it("only bills the increment the new leave adds, not the existing total", () => {
    // existing Mon–Wed already costs 3 days; adding Thu 11 bills exactly 1 more
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

  it("spreads a cross-month request across both months", () => {
    // Fri 29 May → Wed 03 Jun: May = 1 weekday + 1 Sunday · June = 3 weekdays
    const res = getAdditionalDeduction([], {
      start: "2026-05-29",
      end: "2026-06-03",
    });
    expect(res.sundayDays).toBe(1);
    expect(res.weekdayDays).toBe(4);
    expect(res.total).toBe(SUNDAY_RATE + 4 * WEEKDAY_RATE);
  });

  it("returns nothing for an incomplete or reversed date range", () => {
    expect(getAdditionalDeduction([], { start: "", end: "" }).total).toBe(0);
    expect(
      getAdditionalDeduction([], { start: "2026-06-10", end: "2026-06-08" })
        .total,
    ).toBe(0);
  });
});

// ── โบนัส 2 ก้อน ────────────────────────────────────────────────
describe("getLeaveBonus", () => {
  it("pays both parts when the month has no leave at all", () => {
    expect(getLeaveBonus([], null, "2026-06")).toEqual({
      noWeekdayLeave: WEEKDAY_BONUS,
      perfectTopUp: TOPUP,
      total: FULL_BONUS,
    });
  });

  it("keeps only the weekday part when the leave is Sundays only", () => {
    const res = getLeaveBonus(
      [{ start: "2026-06-07", end: "2026-06-07" }],
      null,
      "2026-06",
    );
    expect(res).toEqual({
      noWeekdayLeave: WEEKDAY_BONUS,
      perfectTopUp: 0,
      total: WEEKDAY_BONUS,
    });
  });

  it("pays nothing once a weekday is taken", () => {
    const res = getLeaveBonus(
      [{ start: "2026-06-08", end: "2026-06-08" }],
      null,
      "2026-06",
    );
    expect(res.total).toBe(0);
  });

  it("keeps both parts when the only leave falls on closed days", () => {
    // Sat 06 closed by default → not a leave day at all
    const res = getLeaveBonus(
      [{ start: "2026-06-06", end: "2026-06-06" }],
      null,
      "2026-06",
    );
    expect(res.total).toBe(FULL_BONUS);
  });
});

describe("hasNoWeekdayLeave / hasPerfectAttendance", () => {
  it("separates 'no weekday leave' from 'no leave at all'", () => {
    const sundayOnly = [{ start: "2026-06-07", end: "2026-06-07" }];
    expect(hasNoWeekdayLeave(sundayOnly, null, "2026-06")).toBe(true);
    expect(hasPerfectAttendance(sundayOnly, null, "2026-06")).toBe(false);
  });

  it("only counts the month asked for", () => {
    const may = [{ start: "2026-05-11", end: "2026-05-11" }];
    expect(hasPerfectAttendance(may, null, "2026-05")).toBe(false);
    expect(hasPerfectAttendance(may, null, "2026-06")).toBe(true);
  });
});

describe("getMonthlySettlement", () => {
  it("pays the full bonus for a clean month", () => {
    const res = getMonthlySettlement([], null, "2026-06");
    expect(res.bonus).toBe(FULL_BONUS);
    expect(res.deduction.total).toBe(0);
    expect(res.net).toBe(FULL_BONUS);
  });

  it("nets one Sunday against the surviving weekday bonus", () => {
    // −SUNDAY_RATE +WEEKDAY_BONUS · with 500/300 that is the old −200 rate
    const res = getMonthlySettlement(
      [{ start: "2026-06-07", end: "2026-06-07" }],
      null,
      "2026-06",
    );
    expect(res.bonus).toBe(WEEKDAY_BONUS);
    expect(res.deduction.total).toBe(SUNDAY_RATE);
    expect(res.net).toBe(WEEKDAY_BONUS - SUNDAY_RATE);
  });

  it("charges and drops both bonus parts for a single weekday leave", () => {
    const res = getMonthlySettlement(
      [{ start: "2026-06-08", end: "2026-06-08" }],
      null,
      "2026-06",
    );
    expect(res.bonus).toBe(0);
    expect(res.deduction.total).toBe(WEEKDAY_RATE);
    expect(res.net).toBe(-WEEKDAY_RATE);
  });

  it("keeps the full bonus when the only leave falls on closed days", () => {
    const res = getMonthlySettlement(
      [{ start: "2026-06-06", end: "2026-06-06" }],
      null,
      "2026-06",
    );
    expect(res.bonus).toBe(FULL_BONUS);
    expect(res.net).toBe(FULL_BONUS);
  });
});

// ── ผลกระทบของใบลาใบใหม่ (ฟอร์มยื่นลา) ─────────────────────────
describe("getRequestImpact", () => {
  it("adds the charge and both lost bonus parts for a clean month", () => {
    const res = getRequestImpact([], {
      start: "2026-06-08",
      end: "2026-06-08",
    });
    expect(res.deduction.total).toBe(WEEKDAY_RATE);
    expect(res.bonusLost).toBe(FULL_BONUS);
    expect(res.total).toBe(WEEKDAY_RATE + FULL_BONUS);
  });

  it("only loses the top-up for a Sunday, since the weekday part survives", () => {
    const res = getRequestImpact([], {
      start: "2026-06-07",
      end: "2026-06-07",
    });
    expect(res.deduction.total).toBe(SUNDAY_RATE);
    expect(res.bonusLost).toBe(TOPUP);
    expect(res.total).toBe(SUNDAY_RATE + TOPUP);
  });

  it("does not charge the bonus twice once it is already lost", () => {
    const existing = [{ start: "2026-06-08", end: "2026-06-08" }];
    const res = getRequestImpact(existing, {
      start: "2026-06-09",
      end: "2026-06-09",
    });
    expect(res.bonusLost).toBe(0);
    expect(res.deduction.total).toBe(WEEKDAY_RATE);
    expect(res.total).toBe(WEEKDAY_RATE);
  });

  it("loses only the remaining top-up when a Sunday was already taken", () => {
    // อาทิตย์ไปแล้ว → top up หลุดแล้ว · ลาวันธรรมดาต่อ = เสียก้อน 300 ที่เหลือ
    const existing = [{ start: "2026-06-07", end: "2026-06-07" }];
    const res = getRequestImpact(existing, {
      start: "2026-06-08",
      end: "2026-06-08",
    });
    expect(res.bonusLost).toBe(WEEKDAY_BONUS);
    expect(res.deduction.total).toBe(WEEKDAY_RATE);
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
    // ทั้งสองเดือนมีวันธรรมดา → เสียโบนัสเต็มก้อนทั้งคู่
    expect(res.bonusLost).toBe(2 * FULL_BONUS);
  });
});
