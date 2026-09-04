/* ─── รอบจ่ายเงินเดือน — doc เดียว /config/payrollPeriods ────────────
   เก็บ 2 อย่างของแต่ละรอบที่ปิดแล้ว

     {
       cutoffs:   { "2026-08": "2026-08-27" },        // วันตัดรอบ
       snapshots: { "2026-08": { rows, totals, … } }, // ยอดที่ล็อกไว้
     }

   มีแค่รอบที่ปิดแล้ว · รอบที่ยังไม่ปิดถือว่าเปิดอยู่ (ใช้สิ้นเดือนเป็นขอบ
   ชั่วคราว — ดู utils/payrollPeriod.ts) และคิดยอดสดตลอด

   snapshot ไม่ได้ล็อกทันทีที่กดปิดรอบ — "วันที่กด" ยังแก้ใบลา/ปฏิทินร้าน
   ได้อยู่ ยอดจึงคิดสดต่อไปจนพ้นวันนั้น (เที่ยงคืน) แล้วค่อยล็อก
   · กดปิดรอบ → เขียน snapshot ฉบับร่าง `pending: true`
   · พ้นเที่ยงคืน → finalizePayrollPeriod() เขียนทับด้วยยอดจริง pending: false
   · รอบที่ปิดไว้ก่อนมีระบบนี้ (มีแต่วันตัด ไม่มี snapshot) → ตัวเดียวกันไล่เก็บให้
   หลังล็อกแล้ว จะไปแก้ปฏิทินร้าน/ใบลาย้อนหลังยังไง ยอดรอบนั้นก็ไม่ขยับ  */

import { doc, onSnapshot, runTransaction } from "firebase/firestore";
import type { PeriodCutoffs } from "../utils/payrollPeriod";
import type {
  PeriodSnapshot,
  PeriodSnapshots,
  SettlementRow,
} from "../utils/periodSettlement";
import { db } from "./config";

const PERIODS_PATH = "config/payrollPeriods";

/** เก็บ snapshot ย้อนหลังกี่รอบ — เกินกว่านี้ตัดรอบเก่าสุดทิ้งตอนปิดรอบใหม่
 *  (กัน doc โตไม่มีที่สิ้นสุด · 5 ปีเหลือเฟือสำหรับการอ้างอิงย้อนหลัง) */
const MAX_SNAPSHOTS = 60;

export interface PayrollPeriodsDoc {
  cutoffs: PeriodCutoffs;
  snapshots: PeriodSnapshots;
}

export const EMPTY_PERIODS: PayrollPeriodsDoc = { cutoffs: {}, snapshots: {} };

const YM = /^\d{4}-(0[1-9]|1[0-2])$/;
const YMD = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** เก็บเฉพาะคู่ที่หน้าตาถูกต้อง — กัน field แปลก ๆ ที่แก้มือใน console
 *  ทำให้ทั้งระบบคิดรอบเพี้ยน */
function sanitizeCutoffs(raw: unknown): PeriodCutoffs {
  if (!raw || typeof raw !== "object") return {};
  const out: PeriodCutoffs = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (
      YM.test(key) &&
      typeof value === "string" &&
      YMD.test(value) &&
      value.startsWith(key)
    ) {
      out[key] = value;
    }
  }
  return out;
}

function sanitizeRow(raw: unknown): SettlementRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !r.id) return null;
  const d = (r.deduction || {}) as Record<string, unknown>;
  return {
    id: r.id,
    name: typeof r.name === "string" ? r.name : "",
    deduction: {
      weekdayDays: num(d.weekdayDays),
      sundayDays: num(d.sundayDays),
      weekdayAmount: num(d.weekdayAmount),
      sundayAmount: num(d.sundayAmount),
      total: num(d.total),
    },
    bonus: num(r.bonus),
    net: num(r.net),
  };
}

/** snapshot ที่หน้าตาไม่ครบ = ทิ้งทั้งรอบ ดีกว่าโชว์ยอดครึ่ง ๆ กลาง ๆ
 *  ให้ระบบตกกลับไปคิดยอดสด (ซึ่งยังถูกอยู่ แค่ไม่ได้ล็อก) */
function ymdOr(raw: unknown, fallback: string): string {
  return typeof raw === "string" && YMD.test(raw) ? raw : fallback;
}

function sanitizeSnapshot(key: string, raw: unknown): PeriodSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.start !== "string" || !YMD.test(s.start)) return null;
  if (typeof s.end !== "string" || !YMD.test(s.end)) return null;
  if (!Array.isArray(s.rows)) return null;
  const rows = s.rows.map(sanitizeRow).filter((r): r is SettlementRow => !!r);
  const t = (s.totals || {}) as Record<string, unknown>;
  // snapshot รุ่นเก่า (ก่อนมีการหน่วงล็อกถึงเที่ยงคืน) ไม่มี closedOn/pending
  // → ถือว่าล็อกไปแล้ว ไม่ใช่ฉบับร่างค้าง
  const closedOn = ymdOr(s.closedOn, s.end);
  return {
    yearMonth: key,
    start: s.start,
    end: s.end,
    closedAt: num(s.closedAt),
    closedOn,
    lockedFrom: ymdOr(s.lockedFrom, closedOn),
    pending: s.pending === true,
    rows,
    totals: {
      deducted: num(t.deducted),
      bonus: num(t.bonus),
      net: num(t.net),
    },
  };
}

function sanitizeSnapshots(raw: unknown): PeriodSnapshots {
  if (!raw || typeof raw !== "object") return {};
  const out: PeriodSnapshots = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!YM.test(key)) continue;
    const snap = sanitizeSnapshot(key, value);
    if (snap) out[key] = snap;
  }
  return out;
}

export function subscribePayrollPeriods(
  onChange: (data: PayrollPeriodsDoc) => void,
  onError?: (err: Error) => void,
) {
  return onSnapshot(
    doc(db, PERIODS_PATH),
    (snap) => {
      const data = snap.exists()
        ? (snap.data() as { cutoffs?: unknown; snapshots?: unknown })
        : undefined;
      onChange({
        cutoffs: sanitizeCutoffs(data?.cutoffs),
        snapshots: sanitizeSnapshots(data?.snapshots),
      });
    },
    (err) => {
      console.error("[PayrollPeriods] subscribe error:", err);
      onError?.(err);
    },
  );
}

/** อ่าน-แก้-เขียน ทั้ง doc ใน transaction เดียว
 *
 *  เขียนทับทั้ง doc (ไม่ merge) เพราะทุก mutation ด้านล่างต้อง "ลบ key ออก
 *  จาก map" ได้ ซึ่ง merge ทำไม่ได้ · อ่านผ่าน sanitize เดิมก่อนเสมอ →
 *  field ที่หน้าตาผิดจะถูกตัดทิ้งไปพร้อมกัน                              */
async function mutatePeriods(
  apply: (current: PayrollPeriodsDoc) => PayrollPeriodsDoc,
): Promise<void> {
  const ref = doc(db, PERIODS_PATH);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists()
      ? (snap.data() as { cutoffs?: unknown; snapshots?: unknown })
      : undefined;
    const next = apply({
      cutoffs: sanitizeCutoffs(data?.cutoffs),
      snapshots: sanitizeSnapshots(data?.snapshots),
    });
    tx.set(ref, { ...next, updatedAt: Date.now() });
  });
}

/** ตัด snapshot รอบเก่าสุดทิ้งให้เหลือไม่เกิน MAX_SNAPSHOTS
 *  (key เป็น YYYY-MM → เรียง lexicographic = เรียงตามเวลา) */
function pruneSnapshots(snapshots: PeriodSnapshots): PeriodSnapshots {
  const keys = Object.keys(snapshots).sort();
  if (keys.length <= MAX_SNAPSHOTS) return snapshots;
  const keep = new Set(keys.slice(keys.length - MAX_SNAPSHOTS));
  return Object.fromEntries(
    Object.entries(snapshots).filter(([k]) => keep.has(k)),
  );
}

/** ปิดรอบของ yearMonth ที่วันที่ cutoffYmd แล้วเก็บยอดฉบับร่างไว้
 *
 *  เขียนวันตัด + ยอด ใน transaction เดียว — ไม่งั้นถ้าพลาดกลางทาง
 *  จะได้รอบที่ปิดแล้วแต่ไม่มียอดเก็บไว้ (หรือกลับกัน)
 *
 *  snapshot ที่ส่งมาควรเป็น `pending: true` — ยอดจริงจะถูกเขียนทับโดย
 *  finalizePayrollPeriod() หลังพ้นวันที่กดปิดรอบ                          */
export async function closePayrollPeriod(
  yearMonth: string,
  cutoffYmd: string,
  snapshot: PeriodSnapshot,
): Promise<void> {
  if (!cutoffYmd.startsWith(yearMonth)) {
    throw new Error("วันตัดรอบต้องอยู่ในเดือนเดียวกับรอบ");
  }
  await mutatePeriods((cur) => ({
    cutoffs: { ...cur.cutoffs, [yearMonth]: cutoffYmd },
    snapshots: pruneSnapshots({ ...cur.snapshots, [yearMonth]: snapshot }),
  }));
}

/** เปิดรอบกลับ (ยกเลิกการปิด) — ใช้ตอน admin กดผิดวัน
 *  ทิ้ง snapshot ด้วย เพราะยอดที่ล็อกไว้ผูกกับวันตัดที่กำลังจะยกเลิก */
export async function reopenPayrollPeriod(yearMonth: string): Promise<void> {
  await mutatePeriods((cur) => {
    const { [yearMonth]: _cutoff, ...cutoffs } = cur.cutoffs;
    const { [yearMonth]: _snap, ...snapshots } = cur.snapshots;
    return { cutoffs, snapshots };
  });
}

/** ล็อกยอดจริงเมื่อถึงเวลา — เขียนครั้งเดียว
 *
 *  เขียนได้ 2 กรณี:
 *  1. รอบมีฉบับร่างค้างอยู่ (`pending`) — เคสปกติหลังกดปิดรอบ
 *  2. รอบปิดแล้วแต่ยัง **ไม่มี snapshot เลย** — รอบที่ปิดไว้ตั้งแต่ก่อนมี
 *     ระบบล็อกยอด ถ้าไม่เก็บให้จะคิดยอดสดตลอดไป ไม่มีวันล็อก
 *
 *  นอกจาก 2 กรณีนี้ไม่ทำอะไร — ล็อกไปแล้วห้ามเขียนทับ (ต้องกด "ยึดยอดใหม่")
 *  และรอบที่ถูกเปิดกลับไปแล้ว (ไม่มีวันตัด) ต้องไม่ถูกชุบชีวิตขึ้นมาใหม่   */
export async function finalizePayrollPeriod(
  yearMonth: string,
  snapshot: PeriodSnapshot,
): Promise<void> {
  await mutatePeriods((cur) => {
    if (!cur.cutoffs[yearMonth]) return cur;
    const existing = cur.snapshots[yearMonth];
    if (existing && !existing.pending) return cur;
    return {
      cutoffs: cur.cutoffs,
      snapshots: {
        ...cur.snapshots,
        [yearMonth]: { ...snapshot, pending: false },
      },
    };
  });
}

/** ล็อกยอดใหม่ทับของเดิม — ใช้ตอนยอดสดไม่ตรงกับที่ล็อกไว้ (มีคนแก้ใบลา/
 *  ปฏิทินร้านย้อนหลัง) แล้ว admin ยืนยันว่าจะยึดยอดใหม่ · วันตัดคงเดิม */
export async function relockPayrollPeriod(
  yearMonth: string,
  snapshot: PeriodSnapshot,
): Promise<void> {
  await mutatePeriods((cur) => ({
    cutoffs: cur.cutoffs,
    snapshots: {
      ...cur.snapshots,
      [yearMonth]: { ...snapshot, pending: false },
    },
  }));
}
