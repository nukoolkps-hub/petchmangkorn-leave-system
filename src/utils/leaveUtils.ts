/* ─── Leave counting helpers ───────────────────────────────────── */
import { BUSINESS_RULES } from "../constants";
import type { StoreCalendar } from "../types";
import { dateToYmd, isQuotaCountableDay, isStoreClosed } from "./storeCalendar";

const {
  WEEKDAY_LEAVE_QUOTA,
  OVER_QUOTA_WEEKDAY_DEDUCTION,
  SUNDAY_LEAVE_DEDUCTION,
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

/** ใบลา (อาจคร่อมเดือน) "แตะ" เดือน yearMonth (YYYY-MM) ไหม
 *  ใช้คัดใบลาเข้าเดือนสำหรับ "คำนวณเงิน" — ใบลาคร่อม 2 เดือน (เช่น 30 พ.ค.
 *  → 3 มิ.ย.) ต้องนับเข้าทั้งสองเดือน (เดิมใช้ start.startsWith จับเฉพาะเดือน
 *  เริ่ม → เดือนปลายมองไม่เห็น เงินเพี้ยน) · ต้องใช้คู่กับ arg yearMonth ใน
 *  countWeekdayLeaves/getOverQuotaDays เพื่อ clamp ให้แต่ละเดือนนับเฉพาะวัน
 *  ของตัวเอง */
export function leaveOverlapsMonth(
  leave: { start: string; end: string },
  yearMonth: string,
): boolean {
  return (
    leave.start.slice(0, 7) <= yearMonth && leave.end.slice(0, 7) >= yearMonth
  );
}

/* นับเฉพาะวันลาที่ "ตรงกับวันทำงาน" (ใช้รวมเข้าโควต้า)
   - calendar = undefined → ใช้กฎเดิม (Mon-Fri นับ · เสาร์-อาทิตย์ข้าม)
   - yearMonth (YYYY-MM) → นับเฉพาะวันที่อยู่ในเดือนนั้น (clamp ใบลาคร่อมเดือน
     ให้แต่ละเดือนนับเฉพาะวันของตัวเอง) · undefined = นับทุกวันในช่วง (เดิม)  */
export function countWeekdayLeaves(
  monthLeaves: { start: string; end: string }[],
  calendar?: StoreCalendar | null,
  yearMonth?: string,
) {
  let n = 0;
  monthLeaves.forEach((lv) => {
    const s = new Date(`${lv.start}T00:00:00`);
    const e = new Date(`${lv.end}T00:00:00`);
    const c = new Date(s);
    while (c <= e) {
      if (
        (!yearMonth || dateToYmd(c).slice(0, 7) === yearMonth) &&
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
  yearMonth?: string,
) {
  // เก็บวันที่ "วันทำงาน" ที่ลาทั้งหมด (chronological) · dedupe กันใบลาทับ
  const workDayDates: string[] = [];
  let sundays = 0;

  monthLeaves.forEach((lv) => {
    const s = new Date(`${lv.start}T00:00:00`);
    const e = new Date(`${lv.end}T00:00:00`);
    const c = new Date(s);
    while (c <= e) {
      // clamp ใบลาคร่อมเดือน — นับเฉพาะวันที่อยู่ในเดือน yearMonth (ถ้าระบุ)
      if (!yearMonth || dateToYmd(c).slice(0, 7) === yearMonth) {
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

/** ยอดหักของ "ชุดใบลา" ชุดหนึ่ง · ระบุ yearMonth เพื่อ clamp ใบลาคร่อมเดือน
 *  ให้แต่ละเดือนคิดเฉพาะวันของตัวเอง (โควต้าเป็นรายเดือน) */
export function getLeaveDeduction(
  monthLeaves: { start: string; end: string }[],
  calendar?: StoreCalendar | null,
  yearMonth?: string,
): LeaveDeduction {
  const { weekdays, sundays } = getOverQuotaDays(
    monthLeaves,
    calendar,
    yearMonth,
  );
  const weekdayAmount = weekdays * OVER_QUOTA_WEEKDAY_DEDUCTION;
  const sundayAmount = sundays * SUNDAY_LEAVE_DEDUCTION;
  return {
    weekdayDays: weekdays,
    sundayDays: sundays,
    weekdayAmount,
    sundayAmount,
    total: weekdayAmount + sundayAmount,
  };
}

/** เดือน (YYYY-MM) ทั้งหมดที่ช่วงวันนี้คร่อม */
function monthsInRange(start: string, end: string): string[] {
  if (!start || !end || end < start) return [];
  const months: string[] = [];
  const c = new Date(`${start.slice(0, 7)}-01T00:00:00`);
  const last = end.slice(0, 7);
  for (let guard = 0; guard < 24; guard++) {
    const ym = `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, "0")}`;
    months.push(ym);
    if (ym >= last) break;
    c.setMonth(c.getMonth() + 1);
  }
  return months;
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
): LeaveDeduction {
  const months = monthsInRange(candidate.start, candidate.end);
  if (months.length === 0) return EMPTY_DEDUCTION;

  return months.reduce<LeaveDeduction>((acc, ym) => {
    const before = getLeaveDeduction(existingLeaves, calendar, ym);
    const after = getLeaveDeduction(
      [...existingLeaves, candidate],
      calendar,
      ym,
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
