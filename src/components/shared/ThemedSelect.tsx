/* ─── ThemedSelect — custom dropdown ที่ใช้ฟอนต์ Prompt ทั้งกล่อง ─────────
   ใช้แทน native <select> เมื่อต้องการให้ option list ใช้ฟอนต์เดียวกับ UI
   (native <select> popover ใช้ system font — เปลี่ยนไม่ได้ผ่าน CSS)

   API ใกล้เคียง native select:
   - value: ค่าที่เลือกอยู่ (string) | ""
   - onChange(value)
   - options: { value, label, disabled? }[]
   - placeholder: ข้อความตอนยังไม่เลือก
   - disabled: ปิดทั้งช่อง
   - className: เพิ่ม class นอก default style                                  */

import { ChevronDown as IconChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useClickOutside } from "../../hooks/useClickOutside";

/** สูงสุดของ dropdown (default) · ปรับได้ผ่าน prop maxHeightPx */
const DEFAULT_MAX_DROPDOWN_HEIGHT = 280;
/** padding ขอบ viewport · กัน dropdown ชนขอบจริง (รวม ADMIN tab bar) */
const VIEWPORT_MARGIN = 80;

export interface ThemedSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface ThemedSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: ThemedSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  /** ปุ่มหลัก (closed state) — override class หลัก */
  className?: string;
  /** ความสูงสูงสุดของ dropdown (px) · default 280 (~7-8 รายการ) ·
   *  ส่งค่ามากขึ้นเพื่อโชว์รายการมากขึ้นก่อน scroll */
  maxHeightPx?: number;
  /** render เมนูแบบ overlay position:fixed (คำนวณตำแหน่งจาก viewport · ลอย
   *  ทับเนื้อหา ไม่ดันการ์ด) — ใช้เมื่ออยู่ใน container ที่มี overflow-hidden
   *  (เช่น accordion ความรู้ต่างๆ) ที่จะ clip popover แบบ absolute · ปิดเมื่อ
   *  scroll · อย่าใช้ใน ancestor ที่มี CSS transform (fixed จะอิง element นั้น) */
  menuFixed?: boolean;
}

interface FixedPos {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
}

export default function ThemedSelect({
  value,
  onChange,
  options,
  placeholder = "— เลือก —",
  disabled = false,
  className,
  maxHeightPx = DEFAULT_MAX_DROPDOWN_HEIGHT,
  menuFixed = false,
}: ThemedSelectProps) {
  const [open, setOpen] = useState(false);
  /** flip up เมื่อ space ข้างล่างไม่พอ — กัน dropdown ตกขอบ + ชน tab bar */
  const [openUp, setOpenUp] = useState(false);
  /** max-height ปรับตาม space จริง · กัน scroll หาย */
  const [maxHeight, setMaxHeight] = useState(maxHeightPx);
  /** ตำแหน่ง overlay (เฉพาะ menuFixed) — คำนวณจาก rect ตอนเปิด */
  const [fixedPos, setFixedPos] = useState<FixedPos | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  /** ref ของ list (overlay) — กัน scroll ภายใน list ไปสั่งปิด dropdown */
  const listRef = useRef<HTMLDivElement>(null);
  useClickOutside(wrapRef, () => setOpen(false), open, true);

  // menuFixed: ปิดเมื่อ scroll หน้าเพจ/resize — กันตำแหน่งค้างผิดที่
  // (ข้าม scroll ที่เกิดภายในตัว list เอง เพื่อให้เลื่อนดูตัวเลือกได้)
  useEffect(() => {
    if (!open || !menuFixed) return;
    const onScroll = (e: Event) => {
      if (listRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onResize = () => setOpen(false);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, menuFixed]);

  const selected = options.find((o) => o.value === value) || null;

  function toggleOpen() {
    if (disabled) return;
    if (!open && wrapRef.current) {
      const rect = wrapRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_MARGIN;
      const spaceAbove = rect.top - VIEWPORT_MARGIN;
      // flip up เมื่อข้างล่างไม่พอ + ข้างบนเหลือมากกว่า
      const flip = spaceBelow < maxHeightPx && spaceAbove > spaceBelow;
      setOpenUp(flip);
      setMaxHeight(
        Math.max(120, Math.min(maxHeightPx, flip ? spaceAbove : spaceBelow)),
      );
      setFixedPos(
        menuFixed
          ? {
              left: rect.left,
              width: rect.width,
              ...(flip
                ? { bottom: window.innerHeight - rect.top + 4 }
                : { top: rect.bottom + 4 }),
            }
          : null,
      );
    }
    setOpen((p) => !p);
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={toggleOpen}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`relative ${
          className ??
          `pl-2.5 pr-7 py-[7px] rounded-lg border border-bdr text-sm font-semibold outline-none font-[inherit] bg-cream text-txt cursor-pointer text-left w-full flex items-center
            ${disabled ? "opacity-60 cursor-not-allowed" : ""}`
        }`}
      >
        <span className="flex-1 min-w-0 truncate">
          {selected ? selected.label : placeholder}
        </span>
        <IconChevronDown
          size={12}
          strokeWidth={2.4}
          className={`absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-txt-soft transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          ref={listRef}
          role="listbox"
          style={
            menuFixed && fixedPos
              ? {
                  maxHeight: `${maxHeight}px`,
                  position: "fixed",
                  left: `${fixedPos.left}px`,
                  width: `${fixedPos.width}px`,
                  ...(fixedPos.top !== undefined
                    ? { top: `${fixedPos.top}px` }
                    : { bottom: `${fixedPos.bottom}px` }),
                }
              : { maxHeight: `${maxHeight}px` }
          }
          className={
            menuFixed && fixedPos
              ? "z-50 overflow-y-auto bg-white border border-bdr rounded-lg shadow-[0_8px_24px_rgba(45,26,14,0.15)] font-[inherit] animate-[calFade_0.13s_ease-out] origin-top"
              : `absolute z-50 left-0 right-0 overflow-y-auto bg-white border border-bdr rounded-lg shadow-[0_8px_24px_rgba(45,26,14,0.15)] font-[inherit] animate-[calFade_0.13s_ease-out] ${openUp ? "bottom-full mb-1 origin-bottom" : "top-full mt-1 origin-top"}`
          }
        >
          {options.map((o) => {
            const active = o.value === value;
            return (
              <button
                key={o.value || "__empty__"}
                type="button"
                role="option"
                aria-selected={active}
                disabled={o.disabled}
                onClick={() => {
                  if (o.disabled) return;
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`w-full px-3 py-2 text-left text-sm font-[inherit] border-none cursor-pointer truncate
                  ${active ? "bg-gold-pale text-maroon font-bold" : "bg-white text-txt font-semibold hover:bg-cream"}
                  ${o.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
