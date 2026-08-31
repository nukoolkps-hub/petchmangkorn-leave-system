/* ─── Leave counting helpers ───────────────────────────────────── */
import { BUSINESS_RULES } from "../constants";
import type { StoreCalendar } from "../types";
import {
  getPeriodRange,
  isInPeriod,
  type LeavePeriod,
  lastDayOfMonth,
  type PeriodCutoffs,
  periodKeysInRange,
} from "./payrollPeriod";
import { dateToYmd, isQuotaCountableDay, isStoreClosed } from "./storeCalendar";

/** ช่วงเวลาที่ใช้คิดเงิน — ใส่ได้ 2 แบบ
 *  - "YYYY-MM"  = เดือนปฏิทินเต็มเดือน (ใช้ตอนยังไม่มีรอบจ่าย)
 *  - LeavePeriod = ช่วงวันของ "รอบจ่าย" ที่ admin ปิดไว้
 *  ทุกฟังก์ชันด้านล่างรับได้ทั้งคู่ → call site เดิมไม่ต้องแก้ */
export type PeriodArg = string | LeavePeriod;

function toPeriod(arg?: PeriodArg): LeavePeriod | undefined {
  if (!arg) return undefined;
  return typeof arg === "string"
    ? { start: `${arg}-01`, end: lastDayOfMonth(arg) }
    : arg;
}

const {
  WEEKDAY_LEAVE_QUOTA,
  OVER_QUOTA_WEEKDAY_DEDUCTION,
  SUNDAY_LEAVE_DEDUCTION,
  NO_WEEKDAY_LEAVE_BONUS,
  PERFECT_ATTENDANCE_TOPUP,
} = BUSINESS_RULES;

/** วันที่ลาควรนับเป็น "วันธรรมดา" (เข้าโควต้า) ไหม
 *  = ร้านเปิด AND ไม่ใช่อาทิตย์ (อาทิตย์คิดแยก หักทันที)
 *  - เสาร์ปิด default → ไม่นับ · เสาร์เปิดพิเศษ (อยู่ใน extraOpenSaturdays)
 *    → นับเหมือนวันธรรมดา
 *  - จ-ศ ปิดพิเศษ (อยู่ใน extraClosedWeekdays) → ไม่นับ                  */
function isCountableWeekday(
  date: Date,
  calendar?: StoreCalendar | null,
): boolean {
  return isQuotaCountableDay(dateToYmd(date), calendar);
}

/** ใบลา (อาจคร่อมรอบ) "แตะ" ช่วงที่กำลังคิดเงินไหม
 *  ใช้คัดใบลาเข้าเดือนสำหรับ "คำนวณเงิน" — ใบลาคร่อม 2 เดือน (เช่น 30 พ.ค.
 *  → 3 มิ.ย.) ต้องนับเข้าทั้งสองเดือน (เดิมใช้ start.startsWith จับเฉพาะเดือน
 *  เริ่ม → เดือนปลายมองไม่เห็น เงินเพี้ยน) · ต้องใช้คู่กับ arg period ใน
 *  countWeekdayLeaves/getCountedLeaveDays เพื่อ clamp ให้แต่ละรอบนับเฉพาะวัน
 *  ของตัวเอง */
export function leaveOverlapsMonth(
  leave: { start: string; end: string },
  period: PeriodArg,
): boolean {
  const p = toPeriod(period);
  if (!p) return false;
  // ใบลา "แตะ" ช่วงนี้ = ไม่ได้จบก่อนช่วงเริ่ม และไม่ได้เริ่มหลังช่วงจบ
  return leave.start <= p.end && leave.end >= p.start;
}

/* ─── Helper: รวบรวม "วันที่ลา" ที่นับ แยกวันธรรมดา / วันอาทิตย์ ───
   กฎ:
   - วันทำงาน (จ-ศ ที่ร้านเปิด + เสาร์เปิดพิเศษ) → นับเป็น "วันธรรมดา"
   - วันอาทิตย์ที่ร้านเปิด → นับเป็น "วันอาทิตย์" (คนละอัตรากับวันธรรมดา)
   - วันที่ร้านปิดทุกกรณี (เสาร์ปกติ · จ-ศ ปิดพิเศษ · อาทิตย์ปิดพิเศษ)
     → ไม่นับ ไม่หัก (ร้านปิดอยู่แล้ว — ลาไม่กระทบ)

   คืนเป็น "วันที่" (Set) ไม่ใช่ตัวนับ เพื่อ dedupe ใบลาที่ทับวันกัน —
   ไม่งั้นใบลา 2 ใบที่คร่อมวันเดียวกันจะถูกหัก 2 รอบ

   period → นับเฉพาะวันที่อยู่ในช่วงนั้น (clamp ใบลาคร่อมรอบ ให้แต่ละรอบ
   นับเฉพาะวันของตัวเอง) · undefined = นับทุกวันในช่วงของใบลา              */
function collectLeaveDays(
  monthLeaves: { start: string; end: string }[],
  calendar?: StoreCalendar | null,
  period?: PeriodArg,
): { weekdayDates: Set<string>; sundayDates: Set<string> } {
  const p = toPeriod(period);
  const weekdayDates = new Set<string>();
  const sundayDates = new Set<string>();

  monthLeaves.forEach((lv) => {
    const c = new Date(`${lv.start}T00:00:00`);
    const e = new Date(`${lv.end}T00:00:00`);
    while (c <= e) {
      const ymd = dateToYmd(c);
      if (!p || isInPeriod(ymd, p)) {
        if (c.getDay() === 0) {
          // อาทิตย์ที่ร้านเปิด → หัก · อาทิตย์ปิดพิเศษ → ข้าม
          if (!isStoreClosed(ymd, calendar)) sundayDates.add(ymd);
        } else if (isCountableWeekday(c, calendar)) {
          weekdayDates.add(ymd);
        }
      }
      c.setDate(c.getDate() + 1);
    }
  });

  return { weekdayDates, sundayDates };
}

/** จำนวน "วันธรรมดา" ที่ลาในช่วงนั้น (นับเป็นวัน ไม่ใช่จำนวนใบลา) */
export function countWeekdayLeaves(
  monthLeaves: { start: string; end: string }[],
  calendar?: StoreCalendar | null,
  period?: PeriodArg,
): number {
  return collectLeaveDays(monthLeaves, calendar, period).weekdayDates.size;
}

/** จำนวนวันลาที่ "นับ" ในช่วงนั้น แยกวันธรรมดา/วันอาทิตย์ — ยังไม่หักโควต้า
 *
 *  ใช้ 2 ทาง แล้วแต่ปลายทาง:
 *  - คิดเงิน  → getLeaveDeduction หักโควต้าวันธรรมดาออกก่อนคูณอัตรา
 *  - คิดโบนัส → ใช้ตัวเลขดิบนี้ตรง ๆ เพราะ "ลาแม้อยู่ในโควต้า" ก็เสียโบนัส
 *
 *  IMPORTANT: นับเป็น "วัน" ไม่ใช่ "ใบลา" · ใบเดียวยาว 3 วัน = 3 วัน       */
export function getCountedLeaveDays(
  monthLeaves: { start: string; end: string }[],
  calendar?: StoreCalendar | null,
  period?: PeriodArg,
): { weekdays: number; sundays: number } {
  const { weekdayDates, sundayDates } = collectLeaveDays(
    monthLeaves,
    calendar,
    period,
  );
  return { weekdays: weekdayDates.size, sundays: sundayDates.size };
}

/* ─── ค่าหักเงินจากการลา ─────────────────────────────────────────
   Single source ของการคิดเงิน — UI ทุกที่ต้องเรียกผ่านฟังก์ชันนี้
   ห้ามคูณอัตราเองในคอมโพเนนต์

   กฎ (ค่าอยู่ใน BUSINESS_RULES):
   - วันธรรมดาที่ลา → WEEKDAY_LEAVE_QUOTA วันแรกฟรี · เกินจากนั้นหักวันละ
     OVER_QUOTA_WEEKDAY_DEDUCTION
   - วันอาทิตย์ที่ร้านเปิด → หักวันละ SUNDAY_LEAVE_DEDUCTION (ไม่ใช้โควต้า)
   - วันที่ร้านปิด → ไม่นับ ไม่หัก

   ⚠️ "ฟรี" หมายถึงไม่ถูกหักเงินเท่านั้น — วันในโควต้ายังทำให้เสียโบนัส
   ทั้ง 2 ก้อน (ดู getLeaveBonus)

   ระบบนี้ไม่ได้จ่ายเงินเดือน — ตัวเลขนี้เป็น "ยอดที่ต้องถูกหัก" ให้ ADMIN
   กับพนักงานเห็นตรงกันเท่านั้น ไม่มีการตัดยอดอัตโนมัติที่ไหน            */
export interface LeaveDeduction {
  /** จำนวนวันธรรมดาที่ลา "เกินโควต้า" (= จำนวนวันที่ถูกหักจริง) */
  weekdayDays: number;
  /** จำนวนวันอาทิตย์ที่ลา (ร้านเปิด) */
  sundayDays: number;
  /** ยอดหักจากวันธรรมดาที่เกินโควต้า (บาท) */
  weekdayAmount: number;
  /** ยอดหักจากวันอาทิตย์ (บาท) */
  sundayAmount: number;
  /** ยอดหักรวม (บาท) */
  total: number;
}

const EMPTY_DEDUCTION: LeaveDeduction = {
  weekdayDays: 0,
  sundayDays: 0,
  weekdayAmount: 0,
  sundayAmount: 0,
  total: 0,
};

/** ยอดหักของ "ชุดใบลา" ชุดหนึ่ง · ระบุ period เพื่อ clamp ใบลาคร่อมรอบ
 *  ให้แต่ละรอบคิดเฉพาะวันของตัวเอง (โควต้า/โบนัสเป็นรายรอบ) */
export function getLeaveDeduction(
  monthLeaves: { start: string; end: string }[],
  calendar?: StoreCalendar | null,
  period?: PeriodArg,
): LeaveDeduction {
  const { weekdays, sundays } = getCountedLeaveDays(
    monthLeaves,
    calendar,
    period,
  );
  // โควต้าเป็นของ "ทั้งรอบ" — วันแรก ๆ ฟรี ที่เกินถึงถูกหัก
  const overQuotaWeekdays = Math.max(0, weekdays - WEEKDAY_LEAVE_QUOTA);
  const weekdayAmount = overQuotaWeekdays * OVER_QUOTA_WEEKDAY_DEDUCTION;
  const sundayAmount = sundays * SUNDAY_LEAVE_DEDUCTION;
  return {
    weekdayDays: overQuotaWeekdays,
    sundayDays: sundays,
    weekdayAmount,
    sundayAmount,
    total: weekdayAmount + sundayAmount,
  };
}

/* ─── โบนัส 2 ก้อน ───────────────────────────────────────────────
   1. ไม่ลาวันธรรมดาเลยทั้งรอบ            → NO_WEEKDAY_LEAVE_BONUS
   2. ไม่ลาเลยทั้งรอบ (ธรรมดา + อาทิตย์)  → บวก PERFECT_ATTENDANCE_TOPUP อีก

   ก้อนที่ 2 ทับบนก้อนที่ 1 ไม่ใช่แทนที่ — คนที่ไม่ลาเลยได้ทั้งสองก้อน
   ลาอาทิตย์ 1 วันจึงเหลือแค่ก้อนแรก (−500 +300 = สุทธิ −200)

   ⚠️ ใช้ "วันลาดิบ" ไม่ใช่วันที่เกินโควต้า — ลาวันธรรมดาแม้อยู่ในโควต้า
   (ไม่ถูกหักเงิน) ก็ถือว่า "ลาวันธรรมดาแล้ว" → เสียทั้ง 2 ก้อน
   วันที่ร้านปิดไม่นับเป็นวันลา จึงลาวันร้านปิดได้โดยไม่เสียโบนัส         */
export interface LeaveBonus {
  /** ก้อนไม่ลาวันธรรมดา (0 หรือ NO_WEEKDAY_LEAVE_BONUS) */
  noWeekdayLeave: number;
  /** ก้อน top up ไม่ลาเลย (0 หรือ PERFECT_ATTENDANCE_TOPUP) */
  perfectTopUp: number;
  /** รวมทั้งสองก้อน (บาท) */
  total: number;
}

/** รอบนี้ไม่มีวันลา "วันธรรมดา" เลยไหม */
export function hasNoWeekdayLeave(
  monthLeaves: { start: string; end: string }[],
  calendar?: StoreCalendar | null,
  period?: PeriodArg,
): boolean {
  return countWeekdayLeaves(monthLeaves, calendar, period) === 0;
}

/** รอบนี้ "ไม่มีวันลาที่นับเลย" ไหม — วันที่ร้านปิดไม่นับ จึงลาวันร้านปิด
 *  ได้โดยไม่เสียโบนัส */
export function hasPerfectAttendance(
  monthLeaves: { start: string; end: string }[],
  calendar?: StoreCalendar | null,
  period?: PeriodArg,
): boolean {
  const { weekdays, sundays } = getCountedLeaveDays(
    monthLeaves,
    calendar,
    period,
  );
  return weekdays === 0 && sundays === 0;
}

/** โบนัสของรอบนั้น แยกเป็นก้อน ๆ */
export function getLeaveBonus(
  monthLeaves: { start: string; end: string }[],
  calendar?: StoreCalendar | null,
  period?: PeriodArg,
): LeaveBonus {
  const { weekdays, sundays } = getCountedLeaveDays(
    monthLeaves,
    calendar,
    period,
  );
  const noWeekdayLeave = weekdays === 0 ? NO_WEEKDAY_LEAVE_BONUS : 0;
  const perfectTopUp =
    weekdays === 0 && sundays === 0 ? PERFECT_ATTENDANCE_TOPUP : 0;
  return {
    noWeekdayLeave,
    perfectTopUp,
    total: noWeekdayLeave + perfectTopUp,
  };
}

/** ยอดสุทธิของทั้งรอบ — ค่าหัก + โบนัส
 *  net > 0 = ได้เงินเพิ่ม · net < 0 = ถูกหัก · 0 = เท่าทุน */
export interface MonthlySettlement {
  deduction: LeaveDeduction;
  /** โบนัสรวม (บาท) — เท่ากับ bonusDetail.total */
  bonus: number;
  bonusDetail: LeaveBonus;
  net: number;
}

export function getMonthlySettlement(
  monthLeaves: { start: string; end: string }[],
  calendar?: StoreCalendar | null,
  period?: PeriodArg,
): MonthlySettlement {
  const deduction = getLeaveDeduction(monthLeaves, calendar, period);
  const bonusDetail = getLeaveBonus(monthLeaves, calendar, period);
  return {
    deduction,
    bonus: bonusDetail.total,
    bonusDetail,
    net: bonusDetail.total - deduction.total,
  };
}

/** ยอดหักที่ "ใบลาใบใหม่" จะทำให้เพิ่มขึ้น — ใช้โชว์ตอนกรอกฟอร์ม
 *
 *  คิดเป็นส่วนต่าง: หัก(ใบเดิม + ใบใหม่) − หัก(ใบเดิม) แยกรายรอบแล้วรวม
 *  ไม่ใช่คิดใบใหม่ลอย ๆ เพราะโควต้าเป็นของทั้งรอบ (ถ้ารอบนี้ใช้โควต้าหมดแล้ว
 *  ใบใหม่วันธรรมดาวันแรกก็โดนหักเลย · กลับกันถ้ายังไม่ได้ใช้ วันแรกจะฟรี)
 *  และใบใหม่อาจทับวันกับใบเดิม ซึ่งไม่ควรถูกหักซ้ำ */
export function getAdditionalDeduction(
  existingLeaves: { start: string; end: string }[],
  candidate: { start: string; end: string },
  calendar?: StoreCalendar | null,
  cutoffs?: PeriodCutoffs | null,
): LeaveDeduction {
  const keys = periodKeysInRange(candidate.start, candidate.end, cutoffs);
  if (keys.length === 0) return EMPTY_DEDUCTION;

  return keys.reduce<LeaveDeduction>((acc, key) => {
    const period = getPeriodRange(key, cutoffs);
    const before = getLeaveDeduction(existingLeaves, calendar, period);
    const after = getLeaveDeduction(
      [...existingLeaves, candidate],
      calendar,
      period,
    );
    return {
      weekdayDays: acc.weekdayDays + (after.weekdayDays - before.weekdayDays),
      sundayDays: acc.sundayDays + (after.sundayDays - before.sundayDays),
      weekdayAmount:
        acc.weekdayAmount + (after.weekdayAmount - before.weekdayAmount),
      sundayAmount:
        acc.sundayAmount + (after.sundayAmount - before.sundayAmount),
      total: acc.total + (after.total - before.total),
    };
  }, EMPTY_DEDUCTION);
}

/** ผลกระทบเป็นเงินของ "ใบลาใบใหม่" — ใช้โชว์ตอนกรอกฟอร์ม
 *  รวมทั้งค่าหักที่เพิ่มขึ้น และโบนัสที่จะเสียไป (ถ้ารอบนั้นยังสะอาดอยู่) */
export interface RequestImpact {
  /** ส่วนต่างค่าหักที่ใบนี้ทำให้เพิ่ม */
  deduction: LeaveDeduction;
  /** โบนัสที่จะหลุดเพราะใบนี้ (รวมทุกรอบที่ใบลาคร่อม)
   *  ลาวันอาทิตย์ = เสียเฉพาะ top up · ลาวันธรรมดา = เสียทั้งสองก้อน */
  bonusLost: number;
  /** เงินที่หายไปทั้งหมดจากการยื่นใบนี้ */
  total: number;
}

export function getRequestImpact(
  existingLeaves: { start: string; end: string }[],
  candidate: { start: string; end: string },
  calendar?: StoreCalendar | null,
  cutoffs?: PeriodCutoffs | null,
): RequestImpact {
  const deduction = getAdditionalDeduction(
    existingLeaves,
    candidate,
    calendar,
    cutoffs,
  );
  const bonusLost = periodKeysInRange(
    candidate.start,
    candidate.end,
    cutoffs,
  ).reduce((sum, key) => {
    const period = getPeriodRange(key, cutoffs);
    const before = getMonthlySettlement(existingLeaves, calendar, period).bonus;
    const after = getMonthlySettlement(
      [...existingLeaves, candidate],
      calendar,
      period,
    ).bonus;
    return sum + (before - after);
  }, 0);
  return { deduction, bonusLost, total: deduction.total + bonusLost };
}
