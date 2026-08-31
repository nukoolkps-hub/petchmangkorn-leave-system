/* ─── PayrollPeriodBar — แถบรอบจ่าย + ปุ่มปิด/เปิดรอบ ─────────────────
   ร้านคิดเงินเดือนก่อนสิ้นเดือนได้ (วันตัดไม่คงที่ อยู่ช่วง 25-31)
   admin เลือกวันตัดแล้วกด "ปิดรอบ" → วันลาหลังจากนั้นยกไปรอบถัดไป
   ยอดของรอบจะถูก "ล็อก" หลังพ้นวันที่กดปิดรอบ (เที่ยงคืน) — วันที่กดยัง
   แก้ใบลา/ปฏิทินร้านได้อยู่ · ล็อกแล้วยอดไม่ขยับตามการแก้ย้อนหลังอีก

   ขอบเขตรอบคำนวณโดย utils/payrollPeriod เท่านั้น component นี้แค่ render */

import {
  CalendarCheck as IconCalendarCheck,
  LockKeyhole as IconLock,
  RotateCcw as IconReopen,
} from "lucide-react";
import { useState } from "react";
import { fmtShort, toYMD } from "../../utils/dateUtils";
import { type LeavePeriod, lastDayOfMonth } from "../../utils/payrollPeriod";
import Spinner from "../shared/Spinner";
import ThaiDateInput from "../shared/ThaiDateInput";

interface Props {
  yearMonth: string;
  period: LeavePeriod;
  closed: boolean;
  /** true = รอบนี้ตรงกับเดือนปฏิทินเป๊ะ (ยังไม่เคยปิดรอบไหนเลย) */
  plainMonth: boolean;
  /** epoch ms ตอนล็อกยอดรอบนี้ (undefined = ยังไม่ล็อก) */
  lockedAt?: number;
  /** ปิดรอบแล้วแต่ยังไม่ล็อก — วันที่ยอดจะล็อก (YYYY-MM-DD) */
  lockPendingFrom?: string;
  onClose: (yearMonth: string, cutoffYmd: string) => Promise<void>;
  onReopen: (yearMonth: string) => Promise<void>;
  showToast: (msg: string) => void;
}

export default function PayrollPeriodBar({
  yearMonth,
  period,
  closed,
  plainMonth,
  lockedAt,
  lockPendingFrom,
  onClose,
  onReopen,
  showToast,
}: Props) {
  const [picking, setPicking] = useState(false);
  const [cutoff, setCutoff] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleClose() {
    if (!cutoff) return;
    if (!cutoff.startsWith(yearMonth)) {
      showToast("วันตัดรอบต้องอยู่ในเดือนเดียวกับรอบ");
      return;
    }
    setBusy(true);
    try {
      await onClose(yearMonth, cutoff);
      setPicking(false);
      setCutoff("");
      showToast(
        `ปิดรอบแล้ว — วันลาหลัง ${fmtShort(cutoff)} ยกไปรอบถัดไป · ยอดจะล็อกหลังเที่ยงคืน`,
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : "ปิดรอบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function handleReopen() {
    setBusy(true);
    try {
      await onReopen(yearMonth);
      showToast("เปิดรอบกลับแล้ว — ยอดที่เก็บไว้ถูกลบ กลับไปคิดสดถึงสิ้นเดือน");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "เปิดรอบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`rounded-xl border-[1.5px] px-3.5 py-2.5 mb-3 ${
        closed ? "border-[#1A6B3A40] bg-green-lt" : "border-bdr bg-cream"
      }`}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-[180px]">
          <div
            className={`text-sm font-bold inline-flex items-center gap-1.5 ${
              closed ? "text-green" : "text-maroon"
            }`}
          >
            {closed ? (
              <IconLock size={14} strokeWidth={2.4} />
            ) : (
              <IconCalendarCheck size={14} strokeWidth={2.4} />
            )}
            {closed ? "ปิดรอบแล้ว" : "รอบยังเปิดอยู่"}
          </div>
          <div className="text-xs text-txt-soft mt-0.5">
            {plainMonth ? (
              "นับทั้งเดือน (ยังไม่เคยปิดรอบ)"
            ) : (
              <>
                {fmtShort(period.start)} – {fmtShort(period.end)}
              </>
            )}
          </div>
          {closed && (
            <div className="text-[11px] text-txt-soft mt-0.5">
              {lockedAt
                ? `ล็อกยอดไว้เมื่อ ${fmtShort(toYMD(new Date(lockedAt)))} — แก้ปฏิทิน/ใบลาย้อนหลังไม่ทำให้ยอดรอบนี้ขยับ`
                : lockPendingFrom
                  ? `ยอดจะล็อกหลังเที่ยงคืน (${fmtShort(lockPendingFrom)}) — วันนี้ยังแก้ใบลา/ปฏิทินร้านได้`
                  : "รอบนี้ปิดไว้แต่ไม่มียอดที่ล็อก — ตารางด้านล่างยังคิดสด"}
            </div>
          )}
        </div>

        {closed ? (
          <button
            type="button"
            onClick={handleReopen}
            disabled={busy}
            className="px-3 py-1.5 rounded-[10px] border-[1.5px] border-bdr bg-white text-txt-mid text-xs font-semibold cursor-pointer font-[inherit] inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {busy ? (
              <Spinner size={12} />
            ) : (
              <IconReopen size={13} strokeWidth={2.4} />
            )}
            เปิดรอบกลับ
          </button>
        ) : (
          !picking && (
            <button
              type="button"
              onClick={() => {
                setPicking(true);
                setCutoff(lastDayOfMonth(yearMonth));
              }}
              className="px-3 py-1.5 rounded-[10px] border-none bg-linear-135 from-maroon to-maroon-lt text-white text-xs font-bold cursor-pointer font-[inherit] inline-flex items-center gap-1.5"
            >
              <IconLock size={13} strokeWidth={2.6} />
              ปิดรอบ
            </button>
          )
        )}
      </div>

      {picking && !closed && (
        <div className="mt-2.5 pt-2.5 border-t border-dashed border-bdr">
          <div className="text-xs text-txt-mid mb-1.5">
            เลือกวันสุดท้ายที่นับเข้ารอบนี้ — วันลาหลังจากนั้นจะยกไปรอบถัดไป
          </div>
          <div className="text-[11px] text-txt-soft mb-1.5 inline-flex items-start gap-1">
            <IconLock
              size={11}
              strokeWidth={2.4}
              className="mt-[3px] shrink-0"
            />
            วันนี้ยังแก้ได้ — ยอดจะล็อกหลังเที่ยงคืน ตามที่เห็นในตารางตอนนั้น
          </div>
          <ThaiDateInput
            value={cutoff}
            onChange={setCutoff}
            ariaLabel="วันตัดรอบ"
            className="w-full"
          />
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={() => setPicking(false)}
              disabled={busy}
              className="basis-[34%] shrink-0 py-2 rounded-[10px] border-[1.5px] border-bdr bg-white text-txt-mid text-sm font-semibold cursor-pointer font-[inherit] disabled:opacity-50"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={handleClose}
              disabled={busy || !cutoff}
              className="flex-1 py-2 rounded-[10px] border-none bg-linear-135 from-maroon to-maroon-lt text-white text-sm font-bold cursor-pointer font-[inherit] inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {busy ? (
                <Spinner size={13} />
              ) : (
                <IconLock size={13} strokeWidth={2.6} />
              )}
              ยืนยันปิดรอบ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
