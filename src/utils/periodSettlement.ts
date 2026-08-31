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

import type { Employee, LeaveEntry, StoreCalendar } from "../types";
import { addDaysYmd } from "./dateUtils";
import {
  getLeaveBonus,
  getLeaveDeduction,
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
  /** โบนัสรวมของรอบ (ไม่ลาวันธรรมดา + top up ไม่ลาเลย · 0 = ไม่ได้เลย) */
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

/** ยอดของรอบที่ปิดแล้ว — เก็บลง Firestore ตรง ๆ (plain object)
 *
 *  ⚠️ ยอดยัง **ไม่ล็อกทันที** ตอนกดปิดรอบ — วันที่กดยังแก้ใบลา/ปฏิทินร้าน
 *  ได้อยู่ ยอดจึงคิดสดต่อไปจนพ้นวันนั้น (เที่ยงคืน) แล้วค่อยล็อก
 *  · `pending = true` → ยังไม่ล็อก ตัวเลขในนี้เป็นแค่ฉบับร่าง
 *  · `pending = false` → ล็อกแล้ว ตัวเลขในนี้คือยอดทางการของรอบ           */
export interface PeriodSnapshot {
  /** รอบไหน (YYYY-MM) */
  yearMonth: string;
  /** ช่วงวันของรอบ ณ ตอนปิด — เก็บไว้ด้วยเพราะขอบรอบก็เปลี่ยนได้ */
  start: string;
  end: string;
  /** epoch ms ตอนบันทึกยอดชุดนี้ */
  closedAt: number;
  /** วันที่กดปิดรอบ (YYYY-MM-DD ตามเครื่อง admin) */
  closedOn: string;
  /** ตั้งแต่วันนี้เป็นต้นไปยอดถึงจะล็อก
   *  = วันถัดจาก "วันที่มาทีหลัง" ระหว่างวันที่กดปิดรอบกับวันสุดท้ายของรอบ */
  lockedFrom: string;
  /** true = ยังไม่ถึงเวลาล็อก · ตัวเลขที่โชว์ต้องเป็นยอดสด ไม่ใช่ชุดนี้ */
  pending: boolean;
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

/** สรุปเงินของทุกคนในรอบ — คิดแยกทีละคนแล้วค่อยรวม เพราะโบนัส
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
      const bonus = getLeaveBonus(empLeaves, calendar, period).total;
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

/** ประกอบ snapshot จากยอดที่คิดได้ ณ ตอนนั้น
 *
 *  ⚠️ period ที่ส่งเข้ามาต้องเป็นขอบรอบ "หลังปิด" แล้ว (end = วันตัดที่เลือก)
 *  ไม่ใช่ขอบชั่วคราวสิ้นเดือนที่โชว์อยู่ตอนรอบยังเปิด
 *
 *  - ตอนกดปิดรอบ  → `pending: true` (ฉบับร่าง · ยอดจะล็อกหลังเที่ยงคืน)
 *  - ตอนล็อกจริง   → `pending: false`                                    */
export function makeSnapshot(
  yearMonth: string,
  period: LeavePeriod,
  settlement: PeriodSettlement,
  opts: {
    /** วันที่กดปิดรอบ (YYYY-MM-DD) */
    closedOn: string;
    pending: boolean;
    closedAt?: number;
    /** override วันที่เริ่มล็อก — ปกติคำนวณจาก closedOn + 1 วัน */
    lockedFrom?: string;
  },
): PeriodSnapshot {
  return {
    yearMonth,
    start: period.start,
    end: period.end,
    closedAt: opts.closedAt ?? Date.now(),
    closedOn: opts.closedOn,
    // ล็อกได้ต่อเมื่อพ้นทั้ง "วันที่กดปิดรอบ" และ "วันสุดท้ายของรอบ"
    // — admin กดปิดรอบล่วงหน้าได้ (เช่นกดวันที่ 20 ตัดรอบวันที่ 31) ถ้าดูแค่
    //   วันที่กด ยอดจะล็อกตั้งแต่วันที่ 21 แล้ววันลา 22-31 จะตกหายไปจากยอด
    //   ที่ล็อกไว้ ทั้งที่ยังอยู่ในรอบนั้น
    lockedFrom:
      opts.lockedFrom ??
      addDaysYmd(opts.closedOn > period.end ? opts.closedOn : period.end, 1),
    pending: opts.pending,
    rows: settlement.rows,
    totals: settlement.totals,
  };
}

/** ยอดของรอบนี้ล็อกแล้วหรือยัง — ยังไม่ล็อก = ต้องโชว์ยอดสด */
export function isSnapshotLocked(snapshot?: PeriodSnapshot | null): boolean {
  return Boolean(snapshot) && !snapshot?.pending;
}

/** ถึงเวลาล็อกยอดของรอบนี้แล้วหรือยัง (พ้นวันที่กดปิดรอบมาแล้ว)
 *
 *  true = ต้องคิดยอดสด ณ ตอนนี้แล้วเขียนทับฉบับร่าง · เรียกจากฝั่ง admin
 *  เท่านั้น เพราะ /config/payrollPeriods เขียนได้แค่ admin
 *
 *  ทำไมฝั่ง client ถึงพอ: หลังพ้นวันตัดไปแล้ว สิ่งเดียวที่ทำให้ยอดของรอบ
 *  ขยับได้คือ admin ไปแก้ปฏิทินร้าน/ใบลาย้อนหลัง ซึ่งต้องเปิดแอปอยู่แล้ว —
 *  พอเปิดแอป ตัวนี้จะล็อกให้ก่อนที่จะแก้อะไรได้                          */
export function shouldFinalizeSnapshot(
  snapshot: PeriodSnapshot | null | undefined,
  todayYmd: string,
): boolean {
  return Boolean(snapshot?.pending) && todayYmd >= (snapshot?.lockedFrom ?? "");
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
