/* ─── BonusNote — กล่องโบนัสของรอบ ────────────────────────────────
   โบนัสมี 2 ก้อน (ดู getLeaveBonus ใน utils/leaveUtils)

   - ไม่ลาวันธรรมดาเลย           → +NO_WEEKDAY_LEAVE_BONUS
   - ไม่ลาเลยทั้งรอบ             → บวก PERFECT_ATTENDANCE_TOPUP อีกก้อน

   สถานะที่ component นี้ครอบ:
   - ได้ครบทั้ง 2 ก้อน  → เขียว "ไม่ลาเลยทั้งรอบ +1,000"
   - ได้แค่ก้อนแรก      → เขียว บอกว่ายังขาด top up เพราะลาวันอาทิตย์
   - ไม่ได้เลย          → เทา (ถ้าเปิด showLost)

   ตัวเลขมาจาก getMonthlySettlement()/getLeaveBonus() เท่านั้น
   ห้ามคำนวณเองในคอมโพเนนต์                                          */

import { Gift as IconGift } from "lucide-react";
import { MAX_LEAVE_BONUS } from "../../constants";
import { formatBaht } from "../../utils/format";
import type { LeaveBonus } from "../../utils/leaveUtils";

interface Props {
  /** โบนัสแยกก้อนจาก getMonthlySettlement().bonusDetail */
  bonus: LeaveBonus;
  /** true = รอบที่กำลังดูยังไม่จบ → ข้อความเป็น "ถ้าไม่ลาต่อจนจบรอบ" */
  pending?: boolean;
  /** true = ถ้าโบนัสหลุดหมดแล้วให้ขึ้นบรรทัดเทาบอกด้วย (default: ไม่ขึ้น) */
  showLost?: boolean;
}

export default function BonusNote({
  bonus,
  pending = true,
  showLost = false,
}: Props) {
  if (bonus.total > 0) {
    const full = bonus.perfectTopUp > 0;
    return (
      <div className="rounded-xl border-[1.5px] border-[#1A6B3A40] bg-green-lt px-4 py-3 mt-3 flex items-center justify-between gap-3">
        <div className="flex-1">
          <div className="font-bold text-sm text-green inline-flex items-center gap-1.5">
            <IconGift size={15} strokeWidth={2.4} />
            {full ? "โบนัสไม่ลาเลยทั้งรอบ" : "โบนัสไม่ลาวันธรรมดา"}
          </div>
          <div className="text-xs text-txt-soft mt-0.5">
            {full
              ? pending
                ? "ยังไม่ได้ลาในรอบนี้ — ลาเมื่อไหร่โบนัสลดทันที"
                : "ไม่ได้ลาเลยทั้งรอบ"
              : // ลาแต่วันอาทิตย์ → ก้อนแรกยังอยู่ แต่ top up หลุดไปแล้ว
                `ลาวันอาทิตย์แล้ว — เสีย top up ไม่ลาเลยไป ${formatBaht(
                  MAX_LEAVE_BONUS - bonus.total,
                )}`}
          </div>
        </div>
        <div className="text-lg font-extrabold text-green shrink-0">
          +{formatBaht(bonus.total)}
        </div>
      </div>
    );
  }

  if (!showLost) return null;

  return (
    <div className="text-xs text-txt-soft mt-2 inline-flex items-center gap-1.5">
      <IconGift size={12} strokeWidth={2.2} />
      รอบนี้ลาวันธรรมดาแล้ว — ไม่ได้โบนัส {formatBaht(MAX_LEAVE_BONUS)}
    </div>
  );
}
