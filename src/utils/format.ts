/* ─── Number formatting ────────────────────────────────────────── */

export const formatThaiNumber = (n) =>
  (n || 0).toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

/** จำนวนเงินบาทแบบเต็มจำนวน (ไม่มีทศนิยม) — ใช้กับยอดหักวันลา
 *  ค่าหักเป็นจำนวนเต็มเสมอ (อัตรา × จำนวนวัน) จึงไม่ต้องโชว์สตางค์ */
export const formatBaht = (n: number): string =>
  `${Math.round(n || 0).toLocaleString("th-TH")} บาท`;
