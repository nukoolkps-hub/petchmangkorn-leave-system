/* ─── DeductionSummary — กล่องสรุป "ยอดถูกหัก" จากการลา ──────────
   ใช้ร่วมกันทั้งการ์ดสรุปหน้าแรก · ฟอร์มยื่นลา · modal ยืนยัน
   เพื่อให้ตัวเลขและถ้อยคำตรงกันทุกที่

   ตัวเลขทั้งหมดต้องมาจาก getLeaveDeduction() / getAdditionalDeduction()
   ใน utils/leaveUtils — คอมโพเนนต์นี้แค่ render ไม่คำนวณเอง            */

import {
  CalendarRange as IconCalendarRange,
  Sun as IconSun,
  Wallet as IconWallet,
} from "lucide-react";
import { BUSINESS_RULES } from "../../constants";
import { formatBaht } from "../../utils/format";
import type { LeaveDeduction } from "../../utils/leaveUtils";

interface Props {
  deduction: LeaveDeduction;
  /** หัวข้อกล่อง — default "ยอดที่ถูกหัก" */
  title?: string;
  /** compact = แถวเดียวเล็ก ๆ (ใช้ในลิสต์) · card = กล่องเต็ม (default) */
  variant?: "card" | "compact";
  /** โบนัสที่จะเสียไป (บาท) — รวมเข้ายอดหัวกล่องด้วย
   *  ใช้ในฟอร์มยื่นลา เพื่อให้เห็นว่า "ใบนี้ทำให้เสียเงินรวมเท่าไร" */
  bonusLost?: number;
}

export default function DeductionSummary({
  deduction,
  title = "ยอดที่ถูกหัก",
  variant = "card",
  bonusLost = 0,
}: Props) {
  const { weekdayDays, sundayDays, weekdayAmount, sundayAmount } = deduction;
  const total = deduction.total + bonusLost;
  if (total <= 0) return null;

  if (variant === "compact") {
    return (
      <div className="text-xs text-red font-bold inline-flex items-center gap-1 mt-0.5">
        <IconWallet size={11} strokeWidth={2.4} />
        หัก {formatBaht(total)}
      </div>
    );
  }

  return (
    <div className="rounded-xl border-[1.5px] border-[#C0392B40] bg-[#FEF2F2] px-4 py-3 mt-3">
      <div className="flex items-center justify-between gap-3">
        <div className="font-bold text-sm text-red inline-flex items-center gap-1.5">
          <IconWallet size={15} strokeWidth={2.4} />
          {title}
        </div>
        <div className="text-lg font-extrabold text-red">
          {formatBaht(total)}
        </div>
      </div>
      <div className="mt-2 flex flex-col gap-1">
        {weekdayDays > 0 && (
          <div className="flex items-center justify-between text-xs text-txt-mid">
            <span className="inline-flex items-center gap-1.5">
              <IconCalendarRange size={12} strokeWidth={2.4} />
              วันธรรมดาเกินโควต้า {weekdayDays} วัน ×{" "}
              {BUSINESS_RULES.OVER_QUOTA_WEEKDAY_DEDUCTION}
            </span>
            <span className="font-bold">{formatBaht(weekdayAmount)}</span>
          </div>
        )}
        {sundayDays > 0 && (
          <div className="flex items-center justify-between text-xs text-txt-mid">
            <span className="inline-flex items-center gap-1.5">
              <IconSun size={12} strokeWidth={2.4} />
              วันอาทิตย์ {sundayDays} วัน × {BUSINESS_RULES.SUNDAY_LEAVE_DEDUCTION}
            </span>
            <span className="font-bold">{formatBaht(sundayAmount)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
