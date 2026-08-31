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
  SINGLE_SUNDAY_ONLY_DEDUCTION,
  PERFECT_ATTENDANCE_BONUS,
} = BUSINESS_RULES;

/** วันที่ลาควรนับเข้า "วันธรรมดา" (โควต้า) ไหม
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
 *  countWeekdayLeaves/getOverQuotaDays เพื่อ clamp ให้แต่ละเดือนนับเฉพาะวัน
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

/* นับเฉพาะวันลาที่ "ตรงกับวันทำงาน" (ใช้รวมเข้าโควต้า)
   - calendar = undefined → ใช้กฎเดิม (Mon-Fri นับ · เสาร์-อาทิตย์ข้าม)
   - period → นับเฉพาะวันที่อยู่ในช่วงนั้น (clamp ใบลาคร่อมรอบ
     ให้แต่ละเดือนนับเฉพาะวันของตัวเอง) · undefined = นับทุกวันในช่วง (เดิม)  */
export function countWeekdayLeaves(
  monthLeaves: { start: string; end: string }[],
  calendar?: StoreCalendar | null,
  period?: PeriodArg,
) {
  const p = toPeriod(period);
  let n = 0;
  monthLeaves.forEach((lv) => {
    const s = new Date(`${lv.start}T00:00:00`);
    const e = new Date(`${lv.end}T00:00:00`);
    const c = new Date(s);
    while (c <= e) {
      if (
        (!p || isInPeriod(dateToYmd(c), p)) &&
        isCountableWeekday(c, calendar)
      )
        n++;
      c.setDate(c.getDate() + 1);
    }
  });
  return n;
}

/* ─── Helper: นับวันลาที่ "ถูกหัก" ────────────────────────────────
   กฎ:
   - วันอาทิตย์ทุกวันที่ลา (ร้านเปิด) → ถูกหักทันที (ไม่ใช้โควต้า)
   - วันที่ร้านปิด (เสาร์ default + เสาร์ที่ไม่ได้ open + จ-ศ ปิดพิเศษ +
     อาทิตย์ปิดพิเศษ) → ไม่นับ ไม่หัก (ร้านปิดอยู่แล้ว — ลาไม่กระทบ)
   - วันทำงาน (เสาร์เปิดพิเศษ + จ-ศ ปกติ) → WEEKDAY_LEAVE_QUOTA "วัน" แรก
     ไม่หัก, เกินจากนั้นค่อยหัก
   IMPORTANT: นับเป็น "วัน" ไม่ใช่ "ใบลา" · ใบเดียวยาว 3 วัน = 3 วัน
   (เดิมใช้ entries count ทำให้ใบลายาวๆ ใบเดียวฟรีทั้งใบ → store losing) */
export function getOverQuotaDays(
  monthLeaves: { start: string; end: string }[],
  calendar?: StoreCalendar | null,
  period?: PeriodArg,
) {
  const p = toPeriod(period);
  // เก็บวันที่ "วันทำงาน" ที่ลาทั้งหมด (chronological) · dedupe กันใบลาทับ
  const workDayDates: string[] = [];
  let sundays = 0;

  monthLeaves.forEach((lv) => {
    const s = new Date(`${lv.start}T00:00:00`);
    const e = new Date(`${lv.end}T00:00:00`);
    const c = new Date(s);
    while (c <= e) {
      // clamp ใบลาคร่อมรอบ — นับเฉพาะวันที่อยู่ในช่วงที่ระบุ
      if (!p || isInPeriod(dateToYmd(c), p)) {
        const dow = c.getDay();
        if (dow === 0) {
          // อาทิตย์ที่ร้านเปิด → หักทันที · อาทิตย์ปิดพิเศษ → ข้าม ไม่หัก
          if (!isStoreClosed(dateToYmd(c), calendar)) sundays++;
        } else if (isCountableWeekday(c, calendar)) {
          workDayDates.push(
            `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, "0")}-${String(c.getDate()).padStart(2, "0")}`,
          );
        }
        // วันที่ร้านปิด → ข้าม ไม่นับ ไม่หัก
      }
      c.setDate(c.getDate() + 1);
    }
  });

  // dedupe กันใบลาทับซ้อน + คำนวณส่วนเกินโควต้า "เป็นวัน"
  const uniqueDays = new Set(workDayDates).size;
  const weekdays = Math.max(0, uniqueDays - WEEKDAY_LEAVE_QUOTA);
  return { weekdays, sundays };
}

/* ─── ค่าหักเงินจากการลา ─────────────────────────────────────────
   Single source ของการคิดเงิน — UI ทุกที่ต้องเรียกผ่านฟังก์ชันนี้
   ห้ามคูณอัตราเองในคอมโพเนนต์

   กฎ (ค่าอยู่ใน BUSINESS_RULES):
   - วันธรรมดาที่ลา "เกินโควต้า" → หักวันละ OVER_QUOTA_WEEKDAY_DEDUCTION
   - วันอาทิตย์ที่ร้านเปิด → หักทันทีวันละ SUNDAY_LEAVE_DEDUCTION
     (ไม่ใช้โควต้า · โควต้าวันธรรมดาไม่ช่วย)
   - วันที่ร้านปิด → ไม่นับ ไม่หัก

   ระบบนี้ไม่ได้จ่ายเงินเดือน — ตัวเลขนี้เป็น "ยอดที่ต้องถูกหัก" ให้ ADMIN
   กับพนักงานเห็นตรงกันเท่านั้น ไม่มีการตัดยอดอัตโนมัติที่ไหน            */
export interface LeaveDeduction {
  /** จำนวนวันธรรมดาที่เกินโควต้า */
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
 *  ให้แต่ละเดือนคิดเฉพาะวันของตัวเอง (โควต้า + กฎผ่อนผันเป็นรายเดือน)
 *
 *  กฎผ่อนผัน: ลาอาทิตย์ "วันเดียว" และไม่ได้ลาวันธรรมดาเลย → หักแค่
 *  SINGLE_SUNDAY_ONLY_DEDUCTION · ถ้าลาอาทิตย์ 2 วันขึ้นไป กลับไปคิด
 *  เต็มอัตราทุกวัน (ไม่ใช่วันแรกถูกวันหลังแพง)                          */
export function getLeaveDeduction(
  monthLeaves: { start: string; end: string }[],
  calendar?: StoreCalendar | null,
  period?: PeriodArg,
): LeaveDeduction {
  const { weekdays, sundays } = getOverQuotaDays(monthLeaves, calendar, period);
  // จำนวนวันธรรมดาที่ลา "จริง" (ไม่ใช่เฉพาะส่วนที่เกินโควต้า) — กฎผ่อนผัน
  // ต้องการ "ไม่ลาวันธรรมดาเลย" ซึ่งวันในโควต้าก็ถือว่าลาแล้ว
  const weekdayLeaveDays = countWeekdayLeaves(monthLeaves, calendar, period);
  const eligibleForSingleSundayRate = sundays === 1 && weekdayLeaveDays === 0;

  const weekdayAmount = weekdays * OVER_QUOTA_WEEKDAY_DEDUCTION;
  const sundayAmount = eligibleForSingleSundayRate
    ? SINGLE_SUNDAY_ONLY_DEDUCTION
    : sundays * SUNDAY_LEAVE_DEDUCTION;
  return {
    weekdayDays: weekdays,
    sundayDays: sundays,
    weekdayAmount,
    sundayAmount,
    total: weekdayAmount + sundayAmount,
  };
}

/** เดือนนี้ "ไม่มีวันลาที่นับเลย" ไหม — วันที่ร้านปิดไม่นับ จึงลาวันร้านปิด
 *  ได้โดยไม่เสียโบนัส */
export function hasPerfectAttendance(
  monthLeaves: { start: string; end: string }[],
  calendar?: StoreCalendar | null,
  period?: PeriodArg,
): boolean {
  const { sundays } = getOverQuotaDays(monthLeaves, calendar, period);
  const weekdayLeaveDays = countWeekdayLeaves(monthLeaves, calendar, period);
  return sundays === 0 && weekdayLeaveDays === 0;
}

/** ยอดสุทธิของทั้งเดือน — ค่าหัก + โบนัสไม่ลา
 *  net > 0 = ได้เงินเพิ่ม · net < 0 = ถูกหัก · 0 = เท่าทุน */
export interface MonthlySettlement {
  deduction: LeaveDeduction;
  /** 0 หรือ PERFECT_ATTENDANCE_BONUS */
  bonus: number;
  net: number;
}

export function getMonthlySettlement(
  monthLeaves: { start: string; end: string }[],
  calendar?: StoreCalendar | null,
  period?: PeriodArg,
): MonthlySettlement {
  const deduction = getLeaveDeduction(monthLeaves, calendar, period);
  const bonus = hasPerfectAttendance(monthLeaves, calendar, period)
    ? PERFECT_ATTENDANCE_BONUS
    : 0;
  return { deduction, bonus, net: bonus - deduction.total };
}

/** ยอดหักที่ "ใบลาใบใหม่" จะทำให้เพิ่มขึ้น — ใช้โชว์ตอนกรอกฟอร์ม
 *
 *  คิดเป็นส่วนต่าง: หัก(ใบเดิม + ใบใหม่) − หัก(ใบเดิม) แยกรายเดือน
 *  แล้วรวม — ไม่ใช่คิดใบใหม่ลอย ๆ เพราะโควต้าเป็นของทั้งเดือน
 *  (ถ้าเดือนนี้ใช้โควต้าหมดแล้ว ใบใหม่วันธรรมดาวันแรกก็โดนหักเลย
 *   กลับกันถ้ายังไม่ได้ใช้ วันแรกจะฟรี)                                */
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
 *  รวมทั้งค่าหักที่เพิ่มขึ้น และโบนัสไม่ลาที่จะเสียไป (ถ้าเดือนนั้นยังสะอาดอยู่) */
export interface RequestImpact {
  /** ส่วนต่างค่าหักที่ใบนี้ทำให้เพิ่ม */
  deduction: LeaveDeduction;
  /** โบนัสที่จะหลุดเพราะใบนี้ (0 หรือ PERFECT_ATTENDANCE_BONUS ต่อเดือนที่คร่อม) */
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
