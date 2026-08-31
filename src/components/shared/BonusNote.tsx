/* ─── BonusNote — กล่องโบนัส "ไม่ลาทั้งเดือน" ─────────────────────
   สถานะโบนัสของเดือนหนึ่ง มี 3 แบบ · component นี้ครอบให้ครบ

   - ยังสะอาดอยู่ (bonus > 0)  → เขียว "สิ้นเดือนได้ +1,000"
   - ลาไปแล้ว (bonus = 0)      → เทา บอกว่าโบนัสหลุดแล้ว (ถ้าเปิด showLost)
   - ไม่ต้องการโชว์            → null

   ตัวเลขมาจาก getMonthlySettlement() เท่านั้น ห้ามคำนวณเองในคอมโพเนนต์ */

import { Gift as IconGift } from "lucide-react";
import { BUSINESS_RULES } from "../../constants";
import { formatBaht } from "../../utils/format";

interface Props {
  /** ยอดโบนัสจาก getMonthlySettlement().bonus (0 = ไม่ได้แล้ว) */
  bonus: number;
  /** true = เดือนที่กำลังดูยังไม่จบ → ข้อความเป็น "ถ้าไม่ลาจนสิ้นเดือน" */
  pending?: boolean;
  /** true = ถ้าโบนัสหลุดแล้วให้ขึ้นบรรทัดเทาบอกด้วย (default: ไม่ขึ้น) */
  showLost?: boolean;
}

export default function BonusNote({
  bonus,
  pending = true,
  showLost = false,
}: Props) {
  if (bonus > 0) {
    return (
      <div className="rounded-xl border-[1.5px] border-[#1A6B3A40] bg-green-lt px-4 py-3 mt-3 flex items-center justify-between gap-3">
        <div className="flex-1">
          <div className="font-bold text-sm text-green inline-flex items-center gap-1.5">
            <IconGift size={15} strokeWidth={2.4} />
            โบนัสไม่ลาทั้งเดือน
          </div>
          <div className="text-xs text-txt-soft mt-0.5">
            {pending ? "ยังไม่ได้ลาเดือนนี้ — ลาเมื่อไหร่โบนัสหายทันที" : "ไม่ได้ลาเลยทั้งเดือน"}
          </div>
        </div>
        <div className="text-lg font-extrabold text-green shrink-0">
          +{formatBaht(bonus)}
        </div>
      </div>
    );
  }

  if (!showLost) return null;

  return (
    <div className="text-xs text-txt-soft mt-2 inline-flex items-center gap-1.5">
      <IconGift size={12} strokeWidth={2.2} />
      เดือนนี้ลาแล้ว — ไม่ได้โบนัส{" "}
      {formatBaht(BUSINESS_RULES.PERFECT_ATTENDANCE_BONUS)}
    </div>
  );
}
