import {
  AlertTriangle as IconAlertTriangle,
  Calendar as IconCalendar,
  ChevronDown as IconChevronDown,
  ChevronLeft as IconChevronLeft,
  ChevronRight as IconChevronRight,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  COLORS,
  THAI_MONTH_NAMES,
  THAI_SHORT_WEEKDAY_NAMES,
  TODAY,
} from "../../constants";
import { useClickOutside } from "../../hooks/useClickOutside";
import type { StoreCalendar } from "../../types";
import { fmtShort, toYMD } from "../../utils/dateUtils";
import {
  CAL_NAV_BTN,
  CAL_SELECTED_DAY_BG,
  CAL_SELECTED_DAY_BORDER,
  CAL_SELECTED_DAY_SHADOW,
  CAL_SELECTED_DAY_TEXT,
  CAL_TITLE,
  CAL_TODAY_BG,
  CAL_TODAY_BORDER,
  CAL_TODAY_TEXT,
  calWeekdayClass,
} from "./calendarTheme";

interface Props {
  value: string;
  onChange: (v: string) => void;
  minDate?: string;
  maxDate?: string;
  /** disable วันเสาร์ — default true (ใช้ในฟอร์มลา · ร้านปิดวันเสาร์)
   *  set false เมื่อใช้กับ calc/อื่นๆ ที่ทุกวันเลือกได้
   *  IGNORED ถ้า storeCalendar ถูกส่งมา (storeCalendar จะตัดสินใจเอง) */
  disableSaturdays?: boolean;
  /** ปฏิทินเปิด-ปิดร้าน — ถ้าส่ง: เสาร์ใน extraOpenSaturdays = เลือกได้
   *  · จ-ศ ใน extraClosedWeekdays = ถูก disable (ร้านปิด ลาวันนั้นไม่นับ) */
  storeCalendar?: StoreCalendar | null;
  /** ขนาด · "md" (default · ใช้ในฟอร์มลา) · "sm" (compact · ใช้ในกล่องตัวช่วย) */
  size?: "md" | "sm";
  /** ปฏิทินแสดงแบบ inline (push siblings ลง) แทน popup overlay
   *  · ใช้ใน knowledge/calc ที่ popup จะทับ section ถัดไปแล้วดูเหมือนถูกตัด */
  inline?: boolean;
  /** เลือกได้เฉพาะ จ-ศ (disable เสาร์+อาทิตย์) · ใช้ตอน admin เลือก
   *  "วันธรรมดาปิดพิเศษ" — กันเลือกเสาร์/อาทิตย์ผิด */
  weekdaysOnly?: boolean;
  error?: string;
}

/* ─── Calendar date picker ─────────────────────────────────────── */
export default function CalendarPicker({
  value,
  onChange,
  minDate,
  maxDate,
  disableSaturdays = true,
  storeCalendar,
  size = "md",
  inline = false,
  weekdaysOnly = false,
  error,
}: Props) {
  const [open, setOpen] = useState(false);
  /** popup ใน absolute mode: ถ้าพื้นที่ขวาไม่พอ flip ยึดขอบขวาแทนซ้าย ·
   *  กันปฏิทินตกขอบจอเมื่อ button อยู่ฝั่งขวาของ row (เช่นช่อง "ถึง") */
  const [alignRight, setAlignRight] = useState(false);
  const initD = value ? new Date(`${value}T00:00:00`) : new Date();
  const [vy, setVy] = useState(initD.getFullYear());
  const [vm, setVm] = useState(initD.getMonth());
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);
  useEffect(() => {
    if (value) {
      const d = new Date(`${value}T00:00:00`);
      setVy(d.getFullYear());
      setVm(d.getMonth());
    }
  }, [value]);
  const dim = new Date(vy, vm + 1, 0).getDate();
  const fd = new Date(vy, vm, 1).getDay();
  const cells = [
    ...Array(fd).fill(null),
    ...Array.from({ length: dim }, (_, i) => i + 1),
  ];
  function prevM() {
    if (vm === 0) {
      setVm(11);
      setVy((y) => y - 1);
    } else setVm((m) => m - 1);
  }
  function nextM() {
    if (vm === 11) {
      setVm(0);
      setVy((y) => y + 1);
    } else setVm((m) => m + 1);
  }
  function pick(d: number) {
    onChange(toYMD(new Date(vy, vm, d)));
    setOpen(false);
  }
  function cState(d: number | null) {
    if (d === null) return "empty";
    const dow = new Date(vy, vm, d).getDay();
    const ds = toYMD(new Date(vy, vm, d));
    if (minDate && ds < minDate) return "disabled";
    if (maxDate && ds > maxDate) return "disabled";
    // weekdaysOnly · เลือกได้เฉพาะ จ-ศ (disable เสาร์+อาทิตย์) — มาก่อน
    // storeCalendar/disableSaturdays เพราะเป็นข้อจำกัดที่เข้มกว่า
    if (weekdaysOnly && (dow === 0 || dow === 6)) return "weekend";
    // storeCalendar override · เสาร์เปิดพิเศษ = เลือกลาได้ ·
    // จ-ศ ที่ปิดพิเศษ = ถูก disable (ลาวันร้านปิดไม่นับ) ·
    // ถ้าไม่ส่ง storeCalendar → fallback ไป disableSaturdays prop เดิม
    if (storeCalendar) {
      if (dow === 6 && !storeCalendar.extraOpenSaturdays?.includes(ds))
        return "weekend";
      if (
        dow >= 1 &&
        dow <= 5 &&
        storeCalendar.extraClosedWeekdays?.includes(ds)
      )
        return "weekend";
      // อาทิตย์ปิดพิเศษ → disable (ร้านปิด · ลาวันนั้นไม่นับ)
      if (dow === 0 && storeCalendar.extraClosedSundays?.includes(ds))
        return "weekend";
    } else if (disableSaturdays && dow === 6) {
      return "weekend";
    }
    if (value && ds === value) return "selected";
    if (ds === TODAY) return "today";
    return "normal";
  }
  const has = !!value;
  const isSm = size === "sm";

  // styling แยกตาม size
  const buttonClass = isSm
    ? "w-full flex items-center gap-2.5 px-3 py-2 rounded-[10px] cursor-pointer font-[inherit] box-border transition-all border-[1.5px]"
    : "w-full flex items-center gap-3 px-4 py-3 rounded-[14px] cursor-pointer font-[inherit] box-border transition-all border-[1.5px]";
  const iconBoxClass = isSm
    ? "w-7 h-7 rounded-[8px] shrink-0 flex items-center justify-center"
    : "w-8 h-8 rounded-[10px] shrink-0 flex items-center justify-center";
  const labelClass = isSm
    ? `text-sm ${has ? "font-semibold text-txt" : "font-normal text-txt-soft"}`
    : `text-base ${has ? "font-semibold text-txt" : "font-normal text-txt-soft"}`;

  return (
    <div ref={ref} className="relative mb-3.5">
      <button
        type="button"
        onClick={() => {
          // ก่อนเปิด: ตรวจพื้นที่ขวา ถ้าไม่พอกว้าง popup (≥ 280px) flip ยึดขอบขวา
          if (!open && !inline && ref.current) {
            const rect = ref.current.getBoundingClientRect();
            const POPUP_WIDTH = 280;
            const MARGIN = 8;
            const needFlip =
              rect.left + POPUP_WIDTH + MARGIN > window.innerWidth;
            setAlignRight(needFlip);
          }
          setOpen((v) => !v);
        }}
        className={`${buttonClass}
          ${has ? "bg-gold-pale/30" : "bg-white"}
          ${open ? "shadow-[0_0_0_3px_var(--color-gold)/0.13]" : "shadow-none"}
          ${error ? "border-red" : open ? "border-gold" : has ? "border-[#C9973A90]" : "border-bdr"}`}
      >
        <div
          className={`${iconBoxClass} ${has ? "bg-linear-135 from-gold to-gold-lt" : "bg-cream-dk"}`}
        >
          <IconCalendar
            size={isSm ? 14 : 18}
            color={has ? "#fff" : COLORS.textSoft}
            strokeWidth={2}
          />
        </div>
        <div className="flex-1 text-left">
          <div className={labelClass}>{has ? fmtShort(value) : "เลือกวันที่"}</div>
        </div>
        <IconChevronDown
          size={isSm ? 14 : 16}
          color={COLORS.textSoft}
          strokeWidth={2.5}
          className={`transition-transform duration-200 ${open ? "rotate-180" : "rotate-0"}`}
        />
      </button>
      {error && (
        <div className="text-red text-sm mt-1.5 inline-flex items-center gap-1 animate-[fadeIn_0.25s_ease-out]">
          <IconAlertTriangle size={14} strokeWidth={2.4} />
          {error}
        </div>
      )}
      {open && (
        <div
          className={
            inline
              ? "mt-1.5 bg-white rounded-2xl px-4 pt-4.5 pb-3.5 border border-bdr animate-[calFade_0.18s_ease]"
              : `absolute top-[calc(100%+6px)] ${alignRight ? "right-0" : "left-0"} z-[400] w-full min-w-[280px] max-w-[calc(100vw-1rem)] bg-white rounded-2xl px-4 pt-4.5 pb-3.5 shadow-[0_16px_48px_rgba(90,30,10,0.15)] border border-bdr animate-[calFade_0.18s_ease]`
          }
        >
          <div className="flex items-center justify-between mb-3.5">
            <button type="button" onClick={prevM} className={CAL_NAV_BTN}>
              <IconChevronLeft
                size={14}
                color={COLORS.textMedium}
                strokeWidth={2.5}
              />
            </button>
            <div className={CAL_TITLE}>
              {THAI_MONTH_NAMES[vm]} {vy + 543}
            </div>
            <button type="button" onClick={nextM} className={CAL_NAV_BTN}>
              <IconChevronRight
                size={14}
                color={COLORS.textMedium}
                strokeWidth={2.5}
              />
            </button>
          </div>
          <div className="grid grid-cols-7 mb-1.5">
            {THAI_SHORT_WEEKDAY_NAMES.map((d, i) => (
              <div
                key={d}
                className={calWeekdayClass(disableSaturdays && i === 6)}
              >
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-[3px]">
            {cells.map((d, i) => {
              const st = cState(d);
              const ok = st === "normal" || st === "today";
              return (
                <button
                  type="button"
                  key={i}
                  onClick={() => ok && d !== null && pick(d)}
                  className={`h-[34px] rounded-[10px] font-[inherit] text-sm border-[1.5px]
                  ${d === null ? "cursor-default" : ok ? "cursor-pointer" : "cursor-not-allowed"}
                  ${st === "selected" || st === "today" ? "font-bold" : "font-normal"}`}
                  style={{
                    background:
                      st === "selected"
                        ? CAL_SELECTED_DAY_BG
                        : st === "today"
                          ? CAL_TODAY_BG
                          : "transparent",
                    borderColor:
                      st === "selected"
                        ? CAL_SELECTED_DAY_BORDER
                        : st === "today"
                          ? CAL_TODAY_BORDER
                          : "transparent",
                    color:
                      d === null
                        ? "transparent"
                        : st === "selected"
                          ? CAL_SELECTED_DAY_TEXT
                          : st === "disabled" || st === "weekend"
                            ? COLORS.border
                            : st === "today"
                              ? CAL_TODAY_TEXT
                              : COLORS.text,
                    boxShadow:
                      st === "selected" ? CAL_SELECTED_DAY_SHADOW : "none",
                  }}
                >
                  {d === null ? "" : d}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
