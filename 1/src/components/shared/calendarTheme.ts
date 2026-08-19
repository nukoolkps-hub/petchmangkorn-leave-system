/* ─── Shared calendar / date-picker theme ────────────────────────────
   ทุก "ปฏิทิน + ตัวเลือกเดือน" ในระบบใช้ชุดสไตล์เดียวกัน (maroon + gold brand):
   - CalendarPicker      (ตัวเลือกวันที่แบบกริด · ฟอร์มลา/ตั้งค่าวันร้านปิด)
   - TeamCalendar        (ปฏิทินการลา · หน้า home/admin)
   - MonthChevronNav     (dropdown เลือกเดือน · ลูกศร + popover)
   - ThaiMonthPicker     (dropdown เลือกเดือน · รายการ)

   กฎสี (single source — แก้ที่นี่ที่เดียว):
   - วัน (day cell) ที่เลือก   → ทอง soft (goldPale bg + gold border + gold text)
   - เดือน/ตัวเลือกใน dropdown → maroon ทึบ + ตัวขาว (contrast ดีสุดกับ text)
   - วันนี้ (today)            → เทาอ่อน
   - หัวเดือน/ปี              → maroon · ลูกศร ‹ › → bg-cream                  */

import { COLORS } from "../../constants";

/** ปุ่มลูกศรเลื่อนเดือน ‹ › (รวม disabled state) */
export const CAL_NAV_BTN =
  "w-8 h-8 rounded-lg border border-bdr bg-cream cursor-pointer flex items-center justify-center shrink-0 disabled:opacity-30 disabled:cursor-not-allowed";

/** หัวข้อเดือน/ปี กลางปฏิทิน */
export const CAL_TITLE = "font-bold text-base text-maroon";

/** weekday header cell · isSaturday → หรี่สี (เสาร์ร้านปิดเป็น default) */
export const calWeekdayClass = (isSaturday: boolean) =>
  `text-center text-sm font-semibold py-1 ${
    isSaturday ? "text-txt-soft/50" : "text-txt-soft"
  }`;

/** ปุ่มเลือกเดือน/ตัวเลือกใน dropdown — selected (maroon) / idle */
export const CAL_OPTION_SELECTED = "bg-maroon text-white";
export const CAL_OPTION_IDLE = "bg-transparent text-txt-mid hover:bg-cream";

/** วันนี้ (today) — ใช้ทั้ง CalendarPicker + TeamCalendar */
export const CAL_TODAY_BG = "#E8E8E8";
export const CAL_TODAY_BORDER = "#C8C8C8";
export const CAL_TODAY_TEXT = "#666666";

/** วันที่ถูกเลือก (day cell · ทอง soft) */
export const CAL_SELECTED_DAY_BG = COLORS.goldPale;
export const CAL_SELECTED_DAY_BORDER = `${COLORS.gold}70`;
export const CAL_SELECTED_DAY_TEXT = COLORS.gold;
/** เงาอ่อนของ cell ที่เลือก/มีใบลา (gold) */
export const CAL_SELECTED_DAY_SHADOW = `0 1px 4px ${COLORS.gold}25`;
