/* ─── Store calendar helper — เปิด/ปิดร้านรายวัน ─────────────────────
   Default:
   - อาทิตย์ = เปิด (× 1.5 ตามกฎเดิม) · ปิดได้ถ้า admin mark (extraClosedSundays)
   - เสาร์ = ปิด
   - จ-ศ = เปิด
   Override ผ่าน /config/storeCalendar (admin-managed)

   ⚠️ ต้องเหมือน functions/src/duty/dutyUtils.ts เป๊ะ (client/server ต้อง
   ตัดสินใจตรงกันว่าวันไหนปิด — มี sync check ใน CI)                    */

import type { StoreCalendar } from "../types";

/** วันที่ ymd ("YYYY-MM-DD") = ร้านปิดหรือไม่ */
export function isStoreClosed(
  ymd: string,
  calendar?: StoreCalendar | null,
): boolean {
  const [y, m, d] = ymd.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  if (dow === 6) {
    // เสาร์: ปิด default · เปิดได้ถ้า admin mark
    return !(calendar?.extraOpenSaturdays || []).includes(ymd);
  }
  if (dow === 0) {
    // อาทิตย์: เปิด default (กฎเดิม × 1.5) · ปิดได้ถ้า admin mark
    return (calendar?.extraClosedSundays || []).includes(ymd);
  }
  // จันทร์-ศุกร์: เปิด default · ปิดได้ถ้า admin mark
  return (calendar?.extraClosedWeekdays || []).includes(ymd);
}

/** วันที่ ymd = "วันทำงานที่ลานับโควต้า" หรือไม่
 *  = ร้านเปิด AND ไม่ใช่อาทิตย์ (อาทิตย์มีกฎ × 1.5 แยก)                  */
export function isQuotaCountableDay(
  ymd: string,
  calendar?: StoreCalendar | null,
): boolean {
  const [y, m, d] = ymd.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  if (dow === 0) return false; // อาทิตย์
  return !isStoreClosed(ymd, calendar);
}

/** วันที่ ymd = วันอาทิตย์ — helper สั้นๆ (กฎ × 1.5 หักทุกครั้ง) */
export function isSunday(ymd: string): boolean {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).getDay() === 0;
}

/** parse "YYYY-MM-DD" → Date (local, midnight) — ใช้ iterate range */
export function ymdToDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Date → "YYYY-MM-DD" */
export function dateToYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
