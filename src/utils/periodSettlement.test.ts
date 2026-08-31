import { describe, expect, it } from "vitest";
import { BUSINESS_RULES } from "../constants";
import type { Employee, LeaveEntry, StoreCalendar } from "../types";
import type { LeavePeriod } from "./payrollPeriod";
import {
  buildSettlement,
  diffSettlement,
  isSnapshotLocked,
  makeSnapshot,
  shouldFinalizeSnapshot,
} from "./periodSettlement";

// มิ.ย. 2026: จ.08 → ศ.12 เป็นวันธรรมดาติดกัน 5 วัน · อา.07 / อา.14 เป็นวันอาทิตย์
const JUNE: LeavePeriod = { start: "2026-06-01", end: "2026-06-30" };

function emp(id: string, nickname?: string): Employee {
  return {
    id,
    name: `พนักงาน ${id}`,
    nickname,
    avatar: "",
    avatarType: "text",
    avatarImageUrl: null,
    role: "",
  };
}

function leave(employeeId: string, start: string, end = start): LeaveEntry {
  return {
    id: `${employeeId}-${start}`,
    employeeId,
    employeeName: employeeId,
    type: "personal",
    start,
    end,
    days: 1,
  };
}

const WEEKDAY_RATE = BUSINESS_RULES.WEEKDAY_LEAVE_DEDUCTION;
const FULL_BONUS =
  BUSINESS_RULES.NO_WEEKDAY_LEAVE_BONUS +
  BUSINESS_RULES.PERFECT_ATTENDANCE_TOPUP;

describe("buildSettlement", () => {
  it("โบนัสให้คนที่ไม่ลาเลย · หักคนที่ลาวันธรรมดา", () => {
    const employees = [emp("a", "เอ"), emp("b", "บี")];
    // เอลาวันธรรมดา 2 วัน (หักทั้ง 2 วัน) · บีไม่ลาเลย
    const leaves = [leave("a", "2026-06-08"), leave("a", "2026-06-09")];
    const { rows, totals } = buildSettlement(employees, leaves, null, JUNE);

    const a = rows.find((r) => r.id === "a");
    const b = rows.find((r) => r.id === "b");
    expect(a?.deduction.weekdayDays).toBe(2);
    expect(a?.bonus).toBe(0);
    expect(a?.net).toBe(-2 * WEEKDAY_RATE);
    expect(b?.bonus).toBe(FULL_BONUS);
    expect(b?.net).toBe(FULL_BONUS);

    expect(totals.deducted).toBe(2 * WEEKDAY_RATE);
    expect(totals.bonus).toBe(FULL_BONUS);
    expect(totals.net).toBe(FULL_BONUS - 2 * WEEKDAY_RATE);
  });

  it("ใช้ชื่อเล่นก่อน แล้วค่อย fallback ชื่อจริง", () => {
    const { rows } = buildSettlement(
      [emp("a", "เอ"), emp("b")],
      [],
      null,
      JUNE,
    );
    expect(rows.map((r) => r.name).sort()).toEqual(["พนักงาน b", "เอ"]);
  });

  it("เรียงคนที่สุทธิติดลบมากสุดขึ้นก่อน", () => {
    const employees = [emp("clean"), emp("bad")];
    const leaves = [
      leave("bad", "2026-06-08"),
      leave("bad", "2026-06-09"),
      leave("bad", "2026-06-10"),
    ];
    const { rows } = buildSettlement(employees, leaves, null, JUNE);
    expect(rows[0].id).toBe("bad");
    expect(rows[1].id).toBe("clean");
  });

  it("นับเฉพาะวันที่อยู่ในขอบรอบ — ใบลาคร่อมรอบถูก clamp", () => {
    const employees = [emp("a")];
    // ลา 8-12 มิ.ย. แต่รอบจบวันที่ 9 → นับแค่ 8, 9 = 2 วัน
    const closed: LeavePeriod = { start: "2026-06-01", end: "2026-06-09" };
    const leaves = [leave("a", "2026-06-08", "2026-06-12")];
    const { rows } = buildSettlement(employees, leaves, null, closed);
    expect(rows[0].deduction.weekdayDays).toBe(2);
  });
});

describe("makeSnapshot", () => {
  it("ยอดที่ล็อกไม่ขยับตามปฏิทินร้านที่แก้ย้อนหลัง", () => {
    const employees = [emp("a", "เอ")];
    const leaves = [leave("a", "2026-06-08"), leave("a", "2026-06-09")];

    const snapshot = makeSnapshot(
      "2026-06",
      JUNE,
      buildSettlement(employees, leaves, null, JUNE),
      { closedOn: "2026-06-30", pending: false, closedAt: 1_780_000_000_000 },
    );
    expect(snapshot.totals.deducted).toBe(2 * WEEKDAY_RATE);
    expect(snapshot.start).toBe("2026-06-01");
    expect(snapshot.end).toBe("2026-06-30");
    expect(snapshot.closedAt).toBe(1_780_000_000_000);

    // admin ปิดร้านวันที่ 9 ย้อนหลัง → ยอด "สด" ลดลง แต่ snapshot ต้องเท่าเดิม
    const cal = { extraClosedWeekdays: ["2026-06-09"] } as StoreCalendar;
    const live = buildSettlement(employees, leaves, cal, JUNE);
    expect(live.totals.deducted).toBe(WEEKDAY_RATE);
    expect(snapshot.totals.deducted).toBe(2 * WEEKDAY_RATE);
  });
});

describe("diffSettlement", () => {
  const employees = [emp("a", "เอ"), emp("b", "บี")];
  const leaves = [leave("a", "2026-06-08"), leave("a", "2026-06-09")];
  const snapshot = makeSnapshot(
    "2026-06",
    JUNE,
    buildSettlement(employees, leaves, null, JUNE),
    { closedOn: "2026-06-30", pending: false },
  );

  it("ไม่มีอะไรขยับ → ไม่มี drift", () => {
    const live = buildSettlement(employees, leaves, null, JUNE);
    expect(diffSettlement(snapshot, live)).toEqual([]);
  });

  it("จับได้เมื่อยอดของคนเดิมเปลี่ยนหลังปิดรอบ", () => {
    // ลบใบลาใบที่สองออกหลังปิดรอบ → เอถูกหักน้อยลง 1 วัน
    const live = buildSettlement(employees, [leaves[0]], null, JUNE);
    const drift = diffSettlement(snapshot, live);
    expect(drift).toHaveLength(1);
    expect(drift[0]).toMatchObject({
      id: "a",
      name: "เอ",
      lockedNet: -2 * WEEKDAY_RATE,
      liveNet: -WEEKDAY_RATE,
    });
  });

  it("จับได้เมื่อมีคนถูกเพิ่มเข้าระบบหลังปิดรอบ", () => {
    const live = buildSettlement(
      [...employees, emp("c", "ซี")],
      leaves,
      null,
      JUNE,
    );
    const drift = diffSettlement(snapshot, live);
    expect(drift).toHaveLength(1);
    expect(drift[0].id).toBe("c");
    expect(drift[0].lockedNet).toBeUndefined();
    expect(drift[0].liveNet).toBe(FULL_BONUS);
  });

  it("จับได้เมื่อมีคนถูกลบออกหลังปิดรอบ", () => {
    const live = buildSettlement([employees[0]], leaves, null, JUNE);
    const drift = diffSettlement(snapshot, live);
    expect(drift).toHaveLength(1);
    expect(drift[0].id).toBe("b");
    expect(drift[0].liveNet).toBeUndefined();
    expect(drift[0].lockedNet).toBe(FULL_BONUS);
  });
});

// ── หน่วงล็อกจนพ้นวันที่กดปิดรอบ (เที่ยงคืน) ──────────────────────
describe("lock timing", () => {
  const settlement = buildSettlement([emp("a", "เอ")], [], null, JUNE);

  it("ตั้ง lockedFrom เป็นวันถัดจากวันที่กดปิดรอบ", () => {
    const draft = makeSnapshot("2026-06", JUNE, settlement, {
      closedOn: "2026-06-27",
      pending: true,
    });
    expect(draft.closedOn).toBe("2026-06-27");
    expect(draft.lockedFrom).toBe("2026-06-28");
    expect(draft.pending).toBe(true);
  });

  it("ข้ามเดือนได้ถูก — ปิดรอบวันสุดท้ายของเดือน", () => {
    const draft = makeSnapshot("2026-06", JUNE, settlement, {
      closedOn: "2026-06-30",
      pending: true,
    });
    expect(draft.lockedFrom).toBe("2026-07-01");
  });

  it("ฉบับร่างยังไม่ถือว่าล็อก", () => {
    const draft = makeSnapshot("2026-06", JUNE, settlement, {
      closedOn: "2026-06-27",
      pending: true,
    });
    expect(isSnapshotLocked(draft)).toBe(false);
    expect(isSnapshotLocked({ ...draft, pending: false })).toBe(true);
    expect(isSnapshotLocked(null)).toBe(false);
  });

  it("ยังไม่ถึงเวลาล็อกในวันที่กดปิดรอบ", () => {
    const draft = makeSnapshot("2026-06", JUNE, settlement, {
      closedOn: "2026-06-27",
      pending: true,
    });
    expect(shouldFinalizeSnapshot(draft, "2026-06-27")).toBe(false);
    expect(shouldFinalizeSnapshot(draft, "2026-06-28")).toBe(true);
    // เปิดแอปช้าไปหลายวันก็ยังต้องล็อก
    expect(shouldFinalizeSnapshot(draft, "2026-07-15")).toBe(true);
  });

  it("ล็อกแล้วไม่ล็อกซ้ำ", () => {
    const locked = makeSnapshot("2026-06", JUNE, settlement, {
      closedOn: "2026-06-27",
      pending: false,
    });
    expect(shouldFinalizeSnapshot(locked, "2026-07-15")).toBe(false);
    expect(shouldFinalizeSnapshot(null, "2026-07-15")).toBe(false);
  });
});
