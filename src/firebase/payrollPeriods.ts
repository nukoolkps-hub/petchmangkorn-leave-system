/* ─── รอบจ่ายเงินเดือน — doc เดียว /config/payrollPeriods ────────────
   เก็บ "วันตัดรอบ" ที่ admin ปิดไว้ของแต่ละเดือน

     { cutoffs: { "2026-08": "2026-08-27", "2026-07": "2026-07-26" } }

   มีแค่เดือนที่ปิดแล้ว · เดือนที่ยังไม่ปิดถือว่ารอบยังเปิด (ใช้สิ้นเดือน
   เป็นขอบชั่วคราว — ดู utils/payrollPeriod.ts)                            */

import { doc, onSnapshot, setDoc } from "firebase/firestore";
import type { PeriodCutoffs } from "../utils/payrollPeriod";
import { db } from "./config";

const PERIODS_PATH = "config/payrollPeriods";

export const EMPTY_CUTOFFS: PeriodCutoffs = {};

/** เก็บเฉพาะคู่ที่หน้าตาถูกต้อง — กัน field แปลก ๆ ที่แก้มือใน console
 *  ทำให้ทั้งระบบคิดรอบเพี้ยน */
function sanitize(raw: unknown): PeriodCutoffs {
  if (!raw || typeof raw !== "object") return {};
  const out: PeriodCutoffs = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (
      /^\d{4}-(0[1-9]|1[0-2])$/.test(key) &&
      typeof value === "string" &&
      /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value) &&
      value.startsWith(key)
    ) {
      out[key] = value;
    }
  }
  return out;
}

export function subscribePayrollPeriods(
  onChange: (cutoffs: PeriodCutoffs) => void,
  onError?: (err: Error) => void,
) {
  return onSnapshot(
    doc(db, PERIODS_PATH),
    (snap) => {
      const data = snap.exists()
        ? (snap.data() as { cutoffs?: unknown })
        : undefined;
      onChange(sanitize(data?.cutoffs));
    },
    (err) => {
      console.error("[PayrollPeriods] subscribe error:", err);
      onError?.(err);
    },
  );
}

/** ปิดรอบของเดือน yearMonth ที่วันที่ cutoffYmd */
export async function closePayrollPeriod(
  yearMonth: string,
  cutoffYmd: string,
): Promise<void> {
  if (!cutoffYmd.startsWith(yearMonth)) {
    throw new Error("วันตัดรอบต้องอยู่ในเดือนเดียวกับรอบ");
  }
  await setDoc(
    doc(db, PERIODS_PATH),
    { cutoffs: { [yearMonth]: cutoffYmd }, updatedAt: Date.now() },
    { merge: true },
  );
}

/** เปิดรอบกลับ (ยกเลิกการปิด) — ใช้ตอน admin กดผิดวัน
 *  Firestore ไม่มี "ลบ key ใน map" ผ่าน merge → เขียนทับทั้ง map */
export async function reopenPayrollPeriod(
  yearMonth: string,
  current: PeriodCutoffs,
): Promise<void> {
  const { [yearMonth]: _removed, ...rest } = current;
  await setDoc(
    doc(db, PERIODS_PATH),
    { cutoffs: rest, updatedAt: Date.now() },
    { merge: true },
  );
}
