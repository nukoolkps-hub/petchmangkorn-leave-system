/* ─── รอบจ่ายเงินเดือน (payroll period) ───────────────────────────
   ร้านคิดเงินเดือน "ก่อนสิ้นเดือน" ได้ — เช่นเดือนที่มี 31 วัน อาจปิดรอบ
   วันที่ 27 · วันลาหลังวันตัดจะยกไปนับในรอบถัดไป (ไม่ใช่รอบที่จ่ายไปแล้ว)

   วันตัดไม่คงที่ (อยู่ช่วง 25-31 แล้วแต่เดือน) → admin กด "ปิดรอบ" แล้ว
   เลือกวันเอง · เดือนที่ยังไม่ปิด = รอบเปิดอยู่ ใช้สิ้นเดือนเป็นขอบชั่วคราว

   Single source ของ "รอบไหนกินวันไหน" — leaveUtils รับ LeavePeriod ไปใช้
   ห้ามคำนวณขอบเขตรอบเองที่อื่น                                          */

/** ขอบเขตของรอบ (รวมทั้งสองปลาย) — YYYY-MM-DD */
export interface LeavePeriod {
  start: string;
  end: string;
}

/** วันตัดรอบที่ admin บันทึกไว้ · key = YYYY-MM ของรอบ · value = YYYY-MM-DD */
export type PeriodCutoffs = Record<string, string>;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** YYYY-MM ของเดือนก่อนหน้า */
export function prevYearMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
}

/** YYYY-MM ของเดือนถัดไป */
export function nextYearMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
}

/** วันสุดท้ายของเดือน (YYYY-MM-DD) */
export function lastDayOfMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  return `${yearMonth}-${pad(new Date(y, m, 0).getDate())}`;
}

/** วันถัดไป (YYYY-MM-DD) */
function nextDay(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** รอบของเดือน yearMonth กินวันไหนถึงวันไหน
 *
 *  - ปลายรอบ = วันตัดที่ admin ปิดไว้ · ยังไม่ปิด → สิ้นเดือน (รอบยังเปิดอยู่)
 *  - ต้นรอบ  = วันถัดจากวันตัดของเดือนก่อน · เดือนก่อนไม่ได้ปิด → วันที่ 1
 *
 *  ผลคือถ้าปิดรอบ ส.ค. ที่วันที่ 27 → รอบ ก.ย. เริ่มนับตั้งแต่ 28 ส.ค.
 *  วันลา 28-31 ส.ค. จึงตกไปรอบ ก.ย. โดยอัตโนมัติ                        */
export function getPeriodRange(
  yearMonth: string,
  cutoffs?: PeriodCutoffs | null,
): LeavePeriod {
  const end = cutoffs?.[yearMonth] || lastDayOfMonth(yearMonth);
  const prev = prevYearMonth(yearMonth);
  const prevCutoff = cutoffs?.[prev];
  const start = prevCutoff ? nextDay(prevCutoff) : `${yearMonth}-01`;
  return { start, end };
}

/** รอบนี้ถูกปิด (จ่ายเงินไปแล้ว) หรือยัง */
export function isPeriodClosed(
  yearMonth: string,
  cutoffs?: PeriodCutoffs | null,
): boolean {
  return Boolean(cutoffs?.[yearMonth]);
}

/** รอบนี้ต่างจากเดือนปฏิทินไหม — ใช้ตัดสินว่าต้องโชว์ช่วงวันที่กำกับหรือไม่
 *  (ถ้าตรงกับเดือนปฏิทินเป๊ะ ไม่ต้องรกหน้าจอ) */
export function isCalendarMonth(
  yearMonth: string,
  period: LeavePeriod,
): boolean {
  return (
    period.start === `${yearMonth}-01` &&
    period.end === lastDayOfMonth(yearMonth)
  );
}

/** วันที่ ymd อยู่ในรอบนี้ไหม */
export function isInPeriod(ymd: string, period: LeavePeriod): boolean {
  return ymd >= period.start && ymd <= period.end;
}

/** วันที่นี้ตกอยู่ใน "รอบไหน" (คืน key YYYY-MM ของรอบ)
 *
 *  ถ้าเลยวันตัดของเดือนตัวเองไปแล้ว → ตกไปรอบเดือนถัดไป
 *  เช่นปิดรอบ ส.ค. ที่วันที่ 27 · ลาวันที่ 29 ส.ค. → อยู่รอบ "2026-09" */
export function periodKeyForDate(
  ymd: string,
  cutoffs?: PeriodCutoffs | null,
): string {
  const ym = ymd.slice(0, 7);
  const cutoff = cutoffs?.[ym];
  return cutoff && ymd > cutoff ? nextYearMonth(ym) : ym;
}

/** รอบทั้งหมด (เรียงตามเวลา) ที่ช่วงวัน start–end แตะ · ใช้แยกใบลาคร่อมรอบ */
export function periodKeysInRange(
  start: string,
  end: string,
  cutoffs?: PeriodCutoffs | null,
): string[] {
  if (!start || !end || end < start) return [];
  const keys: string[] = [];
  const d = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  // เดินทีละวันแล้ว dedupe — ช่วงลายาวสุด 31 วัน จึงถูกกว่าการเดาขอบเขต
  for (let guard = 0; d <= last && guard < 400; guard++) {
    const ymd = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const key = periodKeyForDate(ymd, cutoffs);
    if (keys[keys.length - 1] !== key && !keys.includes(key)) keys.push(key);
    d.setDate(d.getDate() + 1);
  }
  return keys;
}
