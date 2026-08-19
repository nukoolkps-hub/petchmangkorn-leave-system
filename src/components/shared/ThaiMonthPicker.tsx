/* ─── ThaiMonthPicker — เลือกเดือน (พ.ศ.) ภาษาไทย ──────────────────
   Dropdown ช่วงเดือนรอบปัจจุบัน — เพียงพอสำหรับการตั้ง rotation anchor
   (ไม่ต้องเลื่อนปี/ดู 12 เดือน) · ปรับช่วงผ่าน monthsBack/monthsAhead
   value/onChange เป็น "YYYY-MM" (ค.ศ.) เหมือน <input type="month"> เดิม */

import {
  Calendar as IconCalendar,
  ChevronDown as IconChevronDown,
} from "lucide-react";
import { useRef, useState } from "react";
import { THAI_MONTH_NAMES } from "../../constants";
import { useClickOutside } from "../../hooks/useClickOutside";
import { CAL_OPTION_IDLE, CAL_OPTION_SELECTED } from "./calendarTheme";

interface Props {
  value: string; // "YYYY-MM"
  onChange: (value: string) => void;
  /** กี่เดือนย้อนหลังจากเดือนนี้ที่เลือกได้ (default 0 = ไม่ย้อนหลัง) */
  monthsBack?: number;
  /** กี่เดือนข้างหน้าจากเดือนนี้ที่เลือกได้ (default 6) */
  monthsAhead?: number;
}

/** label เต็ม: "มิถุนายน 2569" */
function fmtMonthYear(y: number, m1to12: number): string {
  return `${THAI_MONTH_NAMES[m1to12 - 1]} ${y + 543}`;
}

/** -monthsBack..+monthsAhead จากเดือนนี้ (ค.ศ.) → list ของ {ym, label} */
function buildOptions(
  monthsBack: number,
  monthsAhead: number,
): { ym: string; label: string }[] {
  const now = new Date();
  const baseY = now.getFullYear();
  const baseM = now.getMonth() + 1; // 1..12
  const out: { ym: string; label: string }[] = [];
  for (let offset = -monthsBack; offset <= monthsAhead; offset++) {
    // คำนวณ year+month ผ่าน Date เพื่อจัดการการข้ามปี
    const d = new Date(baseY, baseM - 1 + offset, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    out.push({
      ym: `${y}-${String(m).padStart(2, "0")}`,
      label: fmtMonthYear(y, m),
    });
  }
  return out;
}

export default function ThaiMonthPicker({
  value,
  onChange,
  monthsBack = 0,
  monthsAhead = 6,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const options = buildOptions(monthsBack, monthsAhead);
  const [selY, selM] = value
    ? value.split("-").map(Number)
    : [new Date().getFullYear(), new Date().getMonth() + 1];
  const currentLabel = fmtMonthYear(
    selY || new Date().getFullYear(),
    selM || 1,
  );

  // ปิด dropdown เมื่อคลิกข้างนอก
  useClickOutside(wrapRef, () => setOpen(false), open);

  return (
    <div ref={wrapRef} className="relative">
      {/* trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 py-[9px] px-3 rounded-[9px] text-sm font-bold font-[inherit] text-txt border-[1.5px] border-bdr bg-white text-left cursor-pointer transition-all duration-150 active:scale-[0.99]"
      >
        <IconCalendar
          size={15}
          strokeWidth={2.4}
          className="text-maroon shrink-0"
        />
        <span className="flex-1">{currentLabel}</span>
        <IconChevronDown
          size={14}
          strokeWidth={2.4}
          className={`text-txt-soft shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* dropdown — โชว์ 3 ตัว ที่เหลือ scroll */}
      {open && (
        <div className="absolute z-10 left-0 right-0 mt-1.5 rounded-[10px] border-[1.5px] border-bdr bg-white p-1 shadow-[0_8px_24px_rgba(90,30,10,0.12)] max-h-[124px] overflow-y-auto animate-[calFade_0.13s_ease-out] origin-top">
          {options.map((opt) => {
            const isSel = opt.ym === value;
            return (
              <button
                key={opt.ym}
                type="button"
                onClick={() => {
                  onChange(opt.ym);
                  setOpen(false);
                }}
                className={`w-full text-left py-2 px-3 rounded-[7px] text-sm font-semibold cursor-pointer font-[inherit] transition-colors ${
                  isSel ? CAL_OPTION_SELECTED : CAL_OPTION_IDLE
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
