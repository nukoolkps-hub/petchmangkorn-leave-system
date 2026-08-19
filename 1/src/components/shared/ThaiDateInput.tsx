/* ─── ThaiDateInput — date picker หน้าตาไทย ใช้ native picker ของ browser ──
   wrap <input type="date"> ให้แสดง "วว/ดด/ปปปป (พ.ศ.)" หรือ
   "ส. 13 มิ.ย. 2569" หลังเลือก แทน mm/dd/yyyy จาก browser locale       */

import { useRef } from "react";
import { fmtShortWithWeekday } from "../../utils/dateUtils";

interface Props {
  value: string; // "YYYY-MM-DD" (ค.ศ.)
  onChange: (next: string) => void;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
}

export default function ThaiDateInput({
  value,
  onChange,
  className = "",
  placeholder = "วว/ดด/ปปปป (พ.ศ.)",
  ariaLabel = "เลือกวันที่",
}: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const open = () => {
    const el = ref.current;
    if (!el) return;
    // showPicker() — Chrome 99+, Safari 16+, Edge 99+ · fallback = focus + click
    if (typeof el.showPicker === "function") {
      try {
        el.showPicker();
        return;
      } catch {
        // user gesture จำเป็น — บางครั้งโยน NotAllowedError
      }
    }
    el.focus();
    el.click();
  };
  return (
    <button
      type="button"
      onClick={open}
      className={`relative flex items-center text-left ${className}`}
    >
      <span
        className={
          value ? "text-txt font-semibold" : "text-txt-soft font-normal"
        }
      >
        {value ? fmtShortWithWeekday(value) : placeholder}
      </span>
      <input
        ref={ref}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />
    </button>
  );
}
