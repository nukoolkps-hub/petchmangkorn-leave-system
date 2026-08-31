/* ─── สรุปเงินของทั้งรอบ + snapshot ล็อกยอด ─────────────────────────
   "ใครโดนหักเท่าไหร่ / ใครได้โบนัส" ของทุกคนในรอบเดียว

   ทำไมต้อง snapshot:
   ยอดในระบบคำนวณสดจากใบลา + ปฏิทินร้านเสมอ ถ้าปิดรอบ (จ่ายเงินไปแล้ว)
   แล้วมีคนไปแก้ปฏิทินร้านย้อนหลัง หรือ admin เพิ่ม/ลบใบลาเก่า ยอดของ
   รอบที่จ่ายไปแล้วจะขยับตาม → ตัวเลขในระบบไม่ตรงกับเงินที่จ่ายจริง

   ตอนกดปิดรอบจึงเก็บ "ยอด ณ ตอนนั้น" ไว้เป็น snapshot แล้วใช้ snapshot
   เป็นตัวเลขทางการของรอบนั้น · ยอดสดยังคำนวณต่อไปเพื่อ "เทียบ" ให้เห็น
   ว่ามีอะไรขยับหลังปิดรอบไหม (ดู diffSettlement)

   Pure module — ห้ามเรียก Firestore ที่นี่                              */

import { BUSINESS_RULES } from "../constants";
import type { Employee, LeaveEntry, StoreCalendar } from "../types";
import {
  getLeaveDeduction,
  hasPerfectAttendance,
  type LeaveDeduction,
  leaveOverlapsMonth,
} from "./leaveUtils";
import type { LeavePeriod } from "./payrollPeriod";

/** ยอดของพนักงาน 1 คนในรอบ 1 รอบ */
export interface SettlementRow {
  id: string;
  /** ชื่อเล่น (fallback ชื่อจริง) — เก็บเป็น snapshot ไว้ในตัว row
   *  เพื่อให้รอบเก่ายังอ่านออกแม้ภายหลังจะเปลี่ยนชื่อ/ลบพนักงาน */
  name: string;
  deduction: LeaveDeduction;
  /** โบนัสไม่ลาทั้งรอบ (0 = ไม่ได้) */
  bonus: number;
  /** สุทธิ = โบนัส − ยอดหัก (บวก = ได้เพิ่ม · ลบ = ถูกหัก) */
  net: number;
}

export interface SettlementTotals {
  deducted: number;
  bonus: number;
  net: number;
}

export interface PeriodSettlement {
  rows: SettlementRow[];
  totals: SettlementTotals;
}

/** ยอดที่ล็อกไว้ตอนกดปิดรอบ — เก็บลง Firestore ตรง ๆ (plain object) */
export interface PeriodSnapshot {
  /** รอบไหน (YYYY-MM) */
  yearMonth: string;
  /** ช่วงวันของรอบ ณ ตอนปิด — เก็บไว้ด้วยเพราะขอบรอบก็เปลี่ยนได้ */
  start: string;
  end: string;
  /** epoch ms ตอนกดปิดรอบ */
  closedAt: number;
  rows: SettlementRow[];
  totals: SettlementTotals;
}

/** key = YYYY-MM ของรอบที่ปิดแล้ว */
export type PeriodSnapshots = Record<string, PeriodSnapshot>;

export const EMPTY_TOTALS: SettlementTotals = {
  deducted: 0,
  bonus: 0,
  net: 0,
};

function sumTotals(rows: SettlementRow[]): SettlementTotals {
  return rows.reduce<SettlementTotals>(
    (acc, r) => ({
      deducted: acc.deducted + r.deduction.total,
      bonus: acc.bonus + r.bonus,
      net: acc.net + r.net,
    }),
    { ...EMPTY_TOTALS },
  );
}

/** สรุปเงินของทุกคนในรอบ — คิดแยกทีละคนแล้วค่อยรวม เพราะโควต้า/โบนัส
 *  เป็นของ "แต่ละคน" ไม่ใช่ของทั้งร้าน · เรียงคนถูกหักมากสุดขึ้นก่อน */
export function buildSettlement(
  employees: Employee[],
  allLeaves: LeaveEntry[],
  calendar: StoreCalendar | null | undefined,
  period: LeavePeriod,
): PeriodSettlement {
  const rows = employees
    .map<SettlementRow>((emp) => {
      const empLeaves = allLeaves.filter(
        (lv) => lv.employeeId === emp.id && leaveOverlapsMonth(lv, period),
      );
      const deduction = getLeaveDeduction(empLeaves, calendar, period);
      const bonus = hasPerfectAttendance(empLeaves, calendar, period)
        ? BUSINESS_RULES.PERFECT_ATTENDANCE_BONUS
        : 0;
      return {
        id: emp.id,
        name: emp.nickname || emp.name,
        deduction,
        bonus,
        net: bonus - deduction.total,
      };
    })
    .sort((a, b) => a.net - b.net);
  return { rows, totals: sumTotals(rows) };
}

/** ประกอบ snapshot จากยอดที่คิดได้ ณ ตอนกดปิดรอบ
 *
 *  ⚠️ period ที่ส่งเข้ามาต้องเป็นขอบรอบ "หลังปิด" แล้ว (end = วันตัดที่เลือก)
 *  ไม่ใช่ขอบชั่วคราวสิ้นเดือนที่โชว์อยู่ตอนรอบยังเปิด                    */
export function makeSnapshot(
  yearMonth: string,
  period: LeavePeriod,
  settlement: PeriodSettlement,
  closedAt: number = Date.now(),
): PeriodSnapshot {
  return {
    yearMonth,
    start: period.start,
    end: period.end,
    closedAt,
    rows: settlement.rows,
    totals: settlement.totals,
  };
}

/** คนที่ยอดสด "ตอนนี้" ไม่ตรงกับยอดที่ล็อกไว้ตอนปิดรอบ */
export interface SettlementDrift {
  id: string;
  name: string;
  /** สุทธิที่ล็อกไว้ (undefined = ตอนปิดรอบยังไม่มีคนนี้) */
  lockedNet?: number;
  /** สุทธิถ้าคิดใหม่ตอนนี้ (undefined = คนนี้ถูกลบไปแล้ว) */
  liveNet?: number;
}

/** เทียบยอดที่ล็อกกับยอดที่คำนวณสดตอนนี้
 *
 *  คืน [] = ทุกอย่างตรง · ไม่ว่างเมื่อไหร่แปลว่ามีคนไปแก้ใบลา/ปฏิทินร้าน
 *  ย้อนหลังหลังจากปิดรอบไปแล้ว — UI เอาไปเตือน admin
 *  (เทียบด้วย "สุทธิ" พอ เพราะยอดหัก/โบนัสขยับเมื่อไหร่สุทธิก็ขยับด้วย) */
export function diffSettlement(
  snapshot: PeriodSnapshot,
  live: PeriodSettlement,
): SettlementDrift[] {
  const liveById = new Map(live.rows.map((r) => [r.id, r]));
  const drift: SettlementDrift[] = [];

  for (const locked of snapshot.rows) {
    const now = liveById.get(locked.id);
    if (!now) {
      drift.push({ id: locked.id, name: locked.name, lockedNet: locked.net });
    } else if (now.net !== locked.net) {
      drift.push({
        id: locked.id,
        name: now.name || locked.name,
        lockedNet: locked.net,
        liveNet: now.net,
      });
    }
  }

  // คนที่เพิ่งถูกเพิ่มเข้าระบบหลังปิดรอบ — ไม่มีในยอดที่จ่ายไปแล้ว
  const lockedIds = new Set(snapshot.rows.map((r) => r.id));
  for (const now of live.rows) {
    if (!lockedIds.has(now.id)) {
      drift.push({ id: now.id, name: now.name, liveNet: now.net });
    }
  }

  return drift;
}
