/* ─── Date helpers ─────────────────────────────────────────────── */
import {
  THAI_MONTH_NAMES,
  THAI_SHORT_WEEKDAY_NAMES,
  TODAY,
} from "../constants";

export function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "YYYY-MM-DD" + n วัน → "YYYY-MM-DD" (รองรับ n ติดลบ) */
export function addDaysYmd(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map((s) => parseInt(s, 10));
  return toYMD(new Date(y, m - 1, d + n));
}

/** "วันนี้" ค.ศ. "YYYY-MM-DD" — เรียกตอน use เพื่อไม่ stale ข้ามเที่ยงคืน
 *  (`TODAY` ใน constants ค้างค่าตอน module import) */
export function todayYmd(): string {
  return toYMD(new Date());
}

/** "YYYY-MM" (ค.ศ.) → "มิถุนายน 2569" (เดือน + พ.ศ.) · "" ถ้า input ผิดรูป */
export function formatYmThai(ym: string): string {
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return "";
  const [y, m] = ym.split("-").map((s) => parseInt(s, 10));
  return `${THAI_MONTH_NAMES[m - 1]} ${y + 543}`;
}

/** ระยะเวลาทำงาน: "X ปี Y เดือน" / "Y เดือน" / "X ปี" / "เพิ่งเริ่มงาน"
 *  startWorkMonth: "YYYY-MM" (ค.ศ.) · null/invalid → "" (caller ซ่อนไป)
 *  ใช้ทั้ง EmployeeEditModal label + ใบรับรองเงินเดือน — เก็บสูตรที่เดียว */
export function formatTenure(startWorkMonth?: string | null): string {
  if (!startWorkMonth || !/^\d{4}-\d{2}$/.test(startWorkMonth)) return "";
  const [y, m] = startWorkMonth.split("-").map(Number);
  const now = new Date();
  let years = now.getFullYear() - y;
  let months = now.getMonth() - (m - 1);
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years <= 0 && months <= 0) return "เพิ่งเริ่มงาน";
  if (years <= 0) return `${months} เดือน`;
  if (months <= 0) return `${years} ปี`;
  return `${years} ปี ${months} เดือน`;
}

/** นับวัน "ลาที่นับ" ช่วง s..e — ใช้คำนวณ days field ของใบลา (Firestore
 *  rules ต้องการ days > 0) + แสดง preview ในฟอร์ม
 *  - calendar = undefined → default rule: เสาร์ไม่นับ (ปิดอยู่เป็น default)
 *  - calendar ส่งมา → เสาร์เปิดพิเศษ "นับ" · จ-ศ ปิดพิเศษ "ไม่นับ" ·
 *    อาทิตย์ปิดพิเศษ "ไม่นับ"
 *    (ใช้กฎเดียวกับ isStoreClosed ใน salary calc · ไม่ต้องสร้างกฎซ้ำ)        */
export function countWorkdays(
  s: string,
  e: string,
  calendar?: {
    extraOpenSaturdays?: string[];
    extraClosedWeekdays?: string[];
    extraClosedSundays?: string[];
  } | null,
): number {
  if (!s || !e) return 0;
  const S = new Date(`${s}T00:00:00`),
    E = new Date(`${e}T00:00:00`);
  if (E < S) return 0;
  let n = 0;
  const c = new Date(S);
  while (c <= E) {
    const dow = c.getDay();
    const ymd = toYMD(c);
    let isClosed: boolean;
    if (dow === 6) {
      // เสาร์: ปิด default · เปิดได้ถ้า admin mark
      isClosed = !(calendar?.extraOpenSaturdays || []).includes(ymd);
    } else if (dow === 0) {
      // อาทิตย์: เปิด default (× 1.5 ลาก็นับ) · ปิดได้ถ้า admin mark
      isClosed = (calendar?.extraClosedSundays || []).includes(ymd);
    } else {
      // จ-ศ: เปิด default · ปิดได้ถ้า admin mark
      isClosed = (calendar?.extraClosedWeekdays || []).includes(ymd);
    }
    if (!isClosed) n++;
    c.setDate(c.getDate() + 1);
  }
  return n;
}

export function dateRange(s: string, e: string): string[] {
  const out: string[] = [],
    S = new Date(`${s}T00:00:00`),
    E = new Date(`${e}T00:00:00`),
    c = new Date(S);
  while (c <= E) {
    out.push(toYMD(c));
    c.setDate(c.getDate() + 1);
  }
  return out;
}

export function fmtDate(d: string): string {
  if (!d) return "-";
  return new Date(`${d}T00:00:00`).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function fmtShort(d: string): string {
  if (!d) return "เลือกวันที่";
  return new Date(`${d}T00:00:00`).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const WEEKDAYS_TH = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

/* "2026-06-12" → "วันศุกร์ ที่ 12 มิถุนายน 2569" */
export function fmtDateWithWeekday(d: string): string {
  if (!d) return "-";
  const dt = new Date(`${d}T00:00:00`);
  return `วัน${WEEKDAYS_TH[dt.getDay()]} ที่ ${fmtDate(d)}`;
}

/* "2026-06-13" → "ส. 13 มิ.ย. 2569" — สั้นพร้อมวันในสัปดาห์ */
export function fmtShortWithWeekday(d: string): string {
  if (!d) return "-";
  const dt = new Date(`${d}T00:00:00`);
  return `${THAI_SHORT_WEEKDAY_NAMES[dt.getDay()]}. ${fmtShort(d)}`;
}

/* "YYYY-MM" ของวันนี้ — ใช้ join key salary/advance/loan */
export function currentYearMonth(): string {
  return TODAY.slice(0, 7);
}

export function isPast(e: string): boolean {
  return e < TODAY;
}

/* ms epoch → "11 มิ.ย. 2569 · 23:58 น." — ใช้กับ timestamp (เช่น goldPrice) */
export function fmtThaiDateTime(ms: number): string {
  if (!ms) return "—";
  const d = new Date(ms);
  const month = THAI_MONTH_NAMES[d.getMonth()];
  const yearBE = d.getFullYear() + 543;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getDate()} ${month} ${yearBE} · ${hh}:${mm} น.`;
}

export function isFuture(s: string): boolean {
  return s > TODAY;
}
