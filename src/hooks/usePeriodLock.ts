/* ─── usePeriodLock — ล็อกยอดรอบที่ค้างเป็นฉบับร่าง ────────────────────
   กดปิดรอบแล้วยอด "ยังไม่ล็อก" จนกว่าจะพ้นทั้งวันที่กดและวันสุดท้ายของรอบ
   hook นี้คือคนที่ไปเขียนยอดจริงทับฉบับร่างเมื่อถึงเวลา

   ไล่จาก "รอบที่ปิดแล้ว" (มีวันตัดรอบ) ไม่ใช่จาก snapshot — เพราะรอบที่ปิด
   ไว้ตั้งแต่ก่อนมีระบบล็อกยอดจะมีแต่วันตัด ไม่มี snapshot เลย ถ้าไล่จาก
   snapshot รอบพวกนั้นจะคิดยอดสดตลอดไป ไม่มีวันล็อก

   ⚠️ ต้องเรียกจากที่ที่ mount อยู่ตลอดเวลาที่ admin เปิดแอป (AdminPanel)
   ไม่ใช่ใน section ใด section หนึ่ง — ไม่งั้นรอบจะไม่ถูกล็อกจนกว่า admin
   จะบังเอิญเปิด section นั้น

   ทำฝั่ง client ได้เพราะหลังพ้นวันตัด สิ่งเดียวที่ทำให้ยอดขยับคือ admin
   ไปแก้ปฏิทินร้าน/ใบลาย้อนหลัง ซึ่งต้องเปิดแอปอยู่แล้ว — พอเปิดก็ล็อกให้ก่อน
   (finalizePayrollPeriod เช็ค pending ซ้ำใน transaction กันหลายเครื่องเขียนซ้อน) */

import { useEffect, useRef } from "react";
import type { Employee, LeaveEntry, StoreCalendar } from "../types";
import { todayYmd } from "../utils/dateUtils";
import { getPeriodRange, type PeriodCutoffs } from "../utils/payrollPeriod";
import {
  buildSettlement,
  makeSnapshot,
  type PeriodSnapshot,
  type PeriodSnapshots,
  shouldBackfillSnapshot,
  shouldFinalizeSnapshot,
} from "../utils/periodSettlement";

interface Args {
  employeeDirectory: Employee[];
  allLeaves: LeaveEntry[];
  storeCalendar: StoreCalendar;
  /** วันตัดรอบของรอบที่ปิดแล้ว — เป็นตัวตั้งต้นว่า "มีรอบไหนต้องล็อกบ้าง" */
  periodCutoffs: PeriodCutoffs;
  periodSnapshots: PeriodSnapshots;
  onFinalizePeriod: (
    yearMonth: string,
    snapshot: PeriodSnapshot,
  ) => Promise<void>;
  /** false = ยังไม่พร้อมล็อก — ต้องรอให้ใบลาโหลดครบก่อน
   *
   *  ⚠️ นี่คือกันพลาดที่สำคัญที่สุดของ hook นี้ · ถ้าล็อกตอน allLeaves ยังว่าง
   *  จะได้ยอด "ทุกคนไม่ถูกหัก + ได้โบนัสเต็ม" แล้ว pending พลิกเป็น false
   *  ถาวร (finalizePayrollPeriod เช็ค pending ใน transaction → เขียนทับไม่ได้)
   *  ต้องให้ admin กด "ยึดยอดใหม่" เองถึงจะแก้ได้                          */
  enabled?: boolean;
}

export default function usePeriodLock({
  employeeDirectory,
  allLeaves,
  storeCalendar,
  periodCutoffs,
  periodSnapshots,
  onFinalizePeriod,
  enabled = true,
}: Args): void {
  const today = todayYmd();
  // กันยิงซ้ำระหว่างรอ snapshot ใหม่เดินทางกลับมาจาก Firestore
  const finalizingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) return;
    // ไม่มีพนักงานสักคน = ข้อมูลยังมาไม่ครบ (หรือร้านยังไม่ได้ตั้งค่า)
    // ล็อกตอนนี้ได้ snapshot ว่างเปล่าที่แก้ไม่ได้
    if (employeeDirectory.length === 0) return;
    for (const yearMonth of Object.keys(periodCutoffs)) {
      const snap = periodSnapshots[yearMonth];
      // ขอบรอบ: ใช้ที่บันทึกไว้ตอนปิด · ไม่มี snapshot ก็คำนวณจากวันตัดรอบ
      const range = snap
        ? { start: snap.start, end: snap.end }
        : getPeriodRange(yearMonth, periodCutoffs);
      const due = snap
        ? shouldFinalizeSnapshot(snap, today)
        : shouldBackfillSnapshot(range, snap, today);
      if (!due) continue;
      if (finalizingRef.current.has(yearMonth)) continue;
      finalizingRef.current.add(yearMonth);
      onFinalizePeriod(
        yearMonth,
        makeSnapshot(
          yearMonth,
          range,
          buildSettlement(employeeDirectory, allLeaves, storeCalendar, range),
          {
            // ไม่มี snapshot = ไม่รู้ว่ากดปิดรอบวันไหน → ยึดวันสุดท้ายของรอบ
            closedOn: snap?.closedOn ?? range.end,
            pending: false,
            lockedFrom: snap?.lockedFrom,
          },
        ),
      ).catch((err) => {
        // ปล่อยให้ลองใหม่ตอน render ถัดไป (เช่นเน็ตหลุดชั่วคราว)
        finalizingRef.current.delete(yearMonth);
        console.error("[usePeriodLock] ล็อกยอดรอบไม่สำเร็จ:", err);
      });
    }
  }, [
    enabled,
    periodCutoffs,
    periodSnapshots,
    today,
    employeeDirectory,
    allLeaves,
    storeCalendar,
    onFinalizePeriod,
  ]);
}
