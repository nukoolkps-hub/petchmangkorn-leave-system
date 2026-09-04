/* ─── PeriodSettlementPanel — section "สรุปรอบจ่าย" ───────────────────
   แยกจาก "สรุปลา" เพราะคนละงาน: หน้านี้คือ "จ่ายเงินรอบนี้เท่าไหร่"
   (ปิดรอบ · ล็อกยอด · คัดลอกสรุป) ส่วนสรุปลาคือ "ใครลาไปกี่วัน"

   ยอดทุกช่องมาจาก utils/periodSettlement — component นี้แค่ประกอบร่าง
   กับตัดสินใจว่าจะโชว์ "ยอดที่ล็อกไว้" หรือ "ยอดสด"                     */

import { Wallet as IconWallet } from "lucide-react";
import { useCallback, useMemo } from "react";
import type { Employee, LeaveEntry, StoreCalendar } from "../../types";
import { todayYmd } from "../../utils/dateUtils";
import {
  getPeriodRange,
  isCalendarMonth,
  isPeriodClosed,
  type LeavePeriod,
  type PeriodCutoffs,
  periodKeyForDate,
  periodKeysForLeaves,
} from "../../utils/payrollPeriod";
import {
  buildSettlement,
  diffSettlement,
  isSnapshotLocked,
  makeSnapshot,
  type PeriodSnapshot,
  type PeriodSnapshots,
} from "../../utils/periodSettlement";
import MonthChevronNav from "../shared/MonthChevronNav";
import PayrollPeriodBar from "./PayrollPeriodBar";
import PeriodSettlementTable from "./PeriodSettlementTable";

interface Props {
  allLeaves: LeaveEntry[];
  employeeDirectory: Employee[];
  storeCalendar: StoreCalendar;
  /** วันตัดรอบของรอบที่ปิดไปแล้ว — กำหนดว่าแต่ละรอบกินวันไหนถึงวันไหน */
  periodCutoffs: PeriodCutoffs;
  /** ยอดที่ล็อกไว้ตอนปิดรอบ — รอบที่ล็อกแล้วโชว์ชุดนี้แทนยอดสด */
  periodSnapshots: PeriodSnapshots;
  onClosePeriod: (
    yearMonth: string,
    cutoffYmd: string,
    snapshot: PeriodSnapshot,
  ) => Promise<void>;
  onReopenPeriod: (yearMonth: string) => Promise<void>;
  onRelockPeriod: (
    yearMonth: string,
    snapshot: PeriodSnapshot,
  ) => Promise<void>;
  showToast: (msg: string) => void;
  /** รอบที่ดู (YYYY-MM) — controlled โดย AdminPanel · share กับ section อื่น */
  selectedMonth: string;
  onSelectMonth: (month: string) => void;
}

export default function PeriodSettlementPanel({
  allLeaves,
  employeeDirectory,
  storeCalendar,
  periodCutoffs,
  periodSnapshots,
  onClosePeriod,
  onReopenPeriod,
  onRelockPeriod,
  showToast,
  selectedMonth,
  onSelectMonth,
}: Props) {
  const today = todayYmd();

  // รอบที่เลือกดูได้ = รอบที่มีใบลา ∪ รอบที่เคยปิด ∪ รอบของวันนี้ ∪ รอบที่กำลังดู
  // ต้องมี "รอบที่เคยปิด" ด้วย — ไม่งั้นรอบที่ปิดตอนไม่มีใครลาเลยจะหายจาก
  // ลิสต์ กดเปิดรอบกลับไม่ได้
  const months = useMemo(
    () =>
      periodKeysForLeaves(allLeaves, periodCutoffs, [
        selectedMonth,
        periodKeyForDate(today, periodCutoffs),
        ...Object.keys(periodCutoffs),
      ]),
    [allLeaves, periodCutoffs, selectedMonth, today],
  );
  const effectiveMonth = months.includes(selectedMonth)
    ? selectedMonth
    : months[0];

  const period = useMemo(
    () => getPeriodRange(effectiveMonth, periodCutoffs),
    [effectiveMonth, periodCutoffs],
  );

  /* ยอด "สด" ของรอบที่กำลังดู — คิดจากใบลา + ปฏิทินร้าน ณ ตอนนี้ */
  const live = useMemo(
    () => buildSettlement(employeeDirectory, allLeaves, storeCalendar, period),
    [allLeaves, employeeDirectory, storeCalendar, period],
  );

  /* ─── ยอดล็อกหรือยัง ────────────────────────────────────────────
     กดปิดรอบแล้วยอด "ยังไม่ล็อกทันที" — ยังแก้ใบลา/ปฏิทินร้านได้จนพ้นทั้ง
     วันที่กดและวันสุดท้ายของรอบ (เที่ยงคืน) แล้วค่อยล็อก                 */
  const snapshot = periodSnapshots[effectiveMonth];
  const locked = isSnapshotLocked(snapshot);

  // ช่วงวันที่โชว์คู่กับยอด ต้องเป็นช่วงที่ "ยอดชุดนั้น" คิดมา — ไม่งั้นถ้า
  // ขอบรอบขยับทีหลัง หัวข้อความที่คัดลอกไปจะไม่ตรงกับตัวเลขข้างใต้
  const shown =
    locked && snapshot
      ? {
          rows: snapshot.rows,
          totals: snapshot.totals,
          range: { start: snapshot.start, end: snapshot.end },
        }
      : { ...live, range: period };
  const drift = useMemo(
    () => (locked && snapshot ? diffSettlement(snapshot, live) : []),
    [locked, snapshot, live],
  );

  /* คิดยอดของ "ช่วงวันไหนก็ได้" — ใช้ตอนปิดรอบและตอนล็อกยอดย้อนหลัง */
  const settlementFor = useCallback(
    (range: LeavePeriod) =>
      buildSettlement(employeeDirectory, allLeaves, storeCalendar, range),
    [employeeDirectory, allLeaves, storeCalendar],
  );

  const handleClosePeriod = useCallback(
    async (yearMonth: string, cutoffYmd: string) => {
      // ⚠️ ต้องคิดยอดด้วยขอบรอบ "หลังปิด" (end = วันตัดที่เลือก) ไม่ใช่ขอบ
      // ชั่วคราวสิ้นเดือนที่โชว์อยู่ตอนรอบยังเปิด — ไม่งั้นวันลาหลังวันตัด
      // จะถูกนับติดมาในรอบที่จ่ายไปแล้ว
      const closedRange = {
        start: getPeriodRange(yearMonth, periodCutoffs).start,
        end: cutoffYmd,
      };
      // pending: true — ยอดยังไม่ล็อก ชุดนี้เป็นแค่ฉบับร่างเผื่อไม่มีใคร
      // เปิดแอปอีกเลย
      await onClosePeriod(
        yearMonth,
        cutoffYmd,
        makeSnapshot(yearMonth, closedRange, settlementFor(closedRange), {
          closedOn: today,
          pending: true,
        }),
      );
    },
    [onClosePeriod, periodCutoffs, settlementFor, today],
  );

  const handleRelockPeriod = useCallback(
    () =>
      onRelockPeriod(
        effectiveMonth,
        makeSnapshot(effectiveMonth, period, live, {
          closedOn: today,
          pending: false,
          // ยึดยอดใหม่ = ล็อกเดี๋ยวนี้ ไม่ต้องรอเที่ยงคืนอีกรอบ
          lockedFrom: today,
        }),
      ),
    [onRelockPeriod, effectiveMonth, period, live, today],
  );

  return (
    <div className="bg-white rounded-2xl p-4 shadow-[0_2px_10px_rgba(90,30,10,0.06)] border border-bdr">
      <div className="flex items-center justify-between mb-3.5">
        <div className="font-bold text-maroon text-base flex items-center gap-1.5">
          <IconWallet size={16} strokeWidth={2.4} />
          สรุปรอบจ่าย
        </div>
        <MonthChevronNav
          months={months}
          selected={effectiveMonth}
          onSelect={onSelectMonth}
        />
      </div>

      <PayrollPeriodBar
        yearMonth={effectiveMonth}
        period={period}
        closed={isPeriodClosed(effectiveMonth, periodCutoffs)}
        plainMonth={isCalendarMonth(effectiveMonth, period)}
        lockedAt={locked ? snapshot?.closedAt : undefined}
        lockPendingFrom={snapshot?.pending ? snapshot.lockedFrom : undefined}
        onClose={handleClosePeriod}
        onReopen={onReopenPeriod}
        showToast={showToast}
      />

      <PeriodSettlementTable
        rows={shown.rows}
        period={shown.range}
        totals={shown.totals}
        locked={locked}
        lockedAt={locked ? snapshot?.closedAt : undefined}
        lockPendingFrom={snapshot?.pending ? snapshot.lockedFrom : undefined}
        drift={drift}
        onRelock={handleRelockPeriod}
        showToast={showToast}
      />

      {employeeDirectory.length === 0 && (
        <div className="text-txt-soft text-sm text-center py-4">ไม่มีข้อมูล</div>
      )}
    </div>
  );
}
