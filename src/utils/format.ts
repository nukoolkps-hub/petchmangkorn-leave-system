/* ─── Number formatting ────────────────────────────────────────── */

export const formatThaiNumber = (n) =>
  (n || 0).toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

/** ใส่ comma คั่นหลักพันให้ "ส่วนจำนวนเต็ม" ของข้อความที่ผู้ใช้กำลังพิมพ์
 *  · คงส่วนทศนิยมไว้ตามที่พิมพ์ (รวม "3." ที่ยังพิมพ์ไม่จบ) · รองรับเลขติดลบ
 *  · input ต้องเป็น raw (ไม่มี comma อยู่ก่อน) — caller strip comma มาแล้ว
 *  ใช้ให้เห็น comma ทันทีระหว่างพิมพ์ (ไม่ต้องรอ blur) ทั้งใน Calculator +
 *  ช่องกรอกเงิน (MoneyInput) ของหน้าตั้งค่าพนักงาน/เงินเดือน                */
export function formatTypedNumber(raw: string): string {
  if (raw === "" || raw === "-" || raw === ".") return raw;
  const neg = raw.startsWith("-") ? "-" : "";
  const body = neg ? raw.slice(1) : raw;
  const dotIdx = body.indexOf(".");
  const intPart = dotIdx === -1 ? body : body.slice(0, dotIdx);
  const intFmt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (dotIdx === -1) return neg + intFmt;
  return `${neg}${intFmt}.${body.slice(dotIdx + 1)}`;
}

/** map "จำนวนตัวอักษรสำคัญ (เลข/จุด/ลบ) ก่อน cursor" → index ใน string ที่
 *  format แล้ว · ใช้คืนตำแหน่ง cursor หลังแทรก comma สด ๆ ตอนพิมพ์          */
export function caretPosFromDigits(formatted: string, digits: number): number {
  if (digits <= 0) return 0;
  let count = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/[\d.-]/.test(formatted[i])) {
      count++;
      if (count === digits) return i + 1;
    }
  }
  return formatted.length;
}
