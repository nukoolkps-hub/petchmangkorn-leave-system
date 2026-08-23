/* ─── MonthChevronNav — ตัวเลือกเดือนแบบลูกศร + popover เลือกเดือน/ปี ──
   - months เรียงใหม่→เก่า (YYYY-MM)
   - selected = เดือนที่กำลังเปิดอยู่
   - แตะ label เปิด popover เลือกเดือน/ปีตรงๆ (กระโดดได้ไม่ต้องกดลูกศรย้อน)
   - ปุ่ม disable ที่ปลายช่วง · popover ใช้ Buddhist year + ตัวย่อเดือน
   ใช้ใน: SalaryView (สลิป) · LeaveListPanel (ฟิลเตอร์ใบลา)                 */

import {
  ChevronLeft as IconChevronLeft,
  ChevronRight as IconChevronRight,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { THAI_MONTH_SHORT_NAMES } from "../../constants";
import { useClickOutside } from "../../hooks/useClickOutside";
import { formatYmThai } from "../../utils/dateUtils";
import {
  CAL_NAV_BTN,
  CAL_OPTION_IDLE,
  CAL_OPTION_SELECTED,
} from "./calendarTheme";

interface Props {
  months: string[]; // "YYYY-MM" · เรียงใหม่→เก่า
  selected: string;
  onSelect: (m: string) => void;
  /** บรรทัดเล็กใต้ชื่อเดือน (เช่น "4 รายการ") · optional */
  subtitle?: string;
}

export default function MonthChevronNav({
  months,
  selected,
  onSelect,
  subtitle,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useClickOutside(wrapRef, () => setOpen(false), open);

  // safeIdx: ถ้า selected ไม่อยู่ใน months → ลูกศรซ้ายต้อง disable (อย่าเด้ง
  // ไป months[0] เงียบๆ) · caller ที่ลืม pre-compute effectiveMonth จะปลอดภัย
  const rawIdx = months.indexOf(selected);
  const idx = rawIdx === -1 ? months.length : rawIdx;
  const hasOlder = idx < months.length - 1; // ‹ = เดือนเก่ากว่า
  const hasNewer = idx > 0; // › = เดือนใหม่กว่า

  // จัดกลุ่มเดือนตามปี (พ.ศ.) — popover-only data · memo บน months เพื่อไม่
  // rebuild ต่อ render ใน 6 consumer panels
  const byYear = useMemo(() => {
    const out: { year: number; items: string[] }[] = [];
    const byYearMap = new Map<number, string[]>();
    for (const m of months) {
      const yr = parseInt(m.slice(0, 4), 10);
      let items = byYearMap.get(yr);
      if (!items) {
        items = [];
        byYearMap.set(yr, items);
        out.push({ year: yr, items });
      }
      items.push(m);
    }
    return out;
  }, [months]);

  return (
    <div ref={wrapRef} className="relative flex items-center gap-1.5 shrink-0">
      <button
        type="button"
        aria-label="เดือนก่อนหน้า"
        disabled={!hasOlder}
        onClick={() => hasOlder && onSelect(months[idx + 1])}
        className={CAL_NAV_BTN}
      >
        <IconChevronLeft size={14} strokeWidth={2.5} className="text-txt-mid" />
      </button>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`px-2.5 py-1.5 rounded-lg border border-bdr bg-cream text-sm font-semibold text-txt min-w-[108px] text-center cursor-pointer font-[inherit] whitespace-nowrap ${subtitle ? "leading-tight" : ""}`}
      >
        <div>{formatYmThai(selected)}</div>
        {subtitle && (
          <div className="text-[11px] text-txt-soft font-normal mt-0.5">
            {subtitle}
          </div>
        )}
      </button>
      <button
        type="button"
        aria-label="เดือนถัดไป"
        disabled={!hasNewer}
        onClick={() => hasNewer && onSelect(months[idx - 1])}
        className={CAL_NAV_BTN}
      >
        <IconChevronRight
          size={14}
          strokeWidth={2.5}
          className="text-txt-mid"
        />
      </button>

      {open && (
        <div className="absolute z-20 top-full left-1/2 -translate-x-1/2 mt-1.5 w-[196px] rounded-[12px] border-[1.5px] border-bdr bg-white p-2 shadow-[0_8px_24px_rgba(90,30,10,0.14)] max-h-[280px] overflow-y-auto animate-[calFade_0.13s_ease-out] origin-top">
          {byYear.map((g) => (
            <div key={g.year} className="mb-2 last:mb-0">
              <div className="text-[11px] font-bold text-txt-soft px-1 mb-1">
                ปี {g.year + 543}
              </div>
              <div className="grid grid-cols-3 gap-1">
                {g.items.map((m) => {
                  const mm = parseInt(m.slice(5, 7), 10);
                  const isSel = m === selected;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        onSelect(m);
                        setOpen(false);
                      }}
                      className={`py-2 px-1 rounded-[8px] text-sm font-semibold cursor-pointer font-[inherit] transition-colors ${
                        isSel ? CAL_OPTION_SELECTED : CAL_OPTION_IDLE
                      }`}
                    >
                      {THAI_MONTH_SHORT_NAMES[mm - 1]}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
