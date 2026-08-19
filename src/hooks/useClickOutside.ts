/* ─── useClickOutside — ปิด popup/dropdown เมื่อคลิกนอก element ──────
   รวม pattern ที่เคยเขียนซ้ำใน CalendarPicker / BankPicker /
   ThaiMonthPicker · ผูก listener เฉพาะตอน enabled (เช่น dropdown เปิด)

   - ref:        element ที่ถือว่า "ข้างใน" (คลิกข้างในไม่ปิด)
   - onOutside:  callback เมื่อคลิกข้างนอก (หรือกด Esc ถ้าเปิด closeOnEsc)
   - enabled:    ผูก listener เมื่อ true (default true)
   - closeOnEsc: ปิดด้วยปุ่ม Escape ด้วย (default false)              */

import { type RefObject, useEffect, useRef } from "react";

export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  onOutside: () => void,
  enabled = true,
  closeOnEsc = false,
) {
  // เก็บ callback ล่าสุดใน ref → listener ไม่ต้อง re-subscribe ทุก render
  const cb = useRef(onOutside);
  cb.current = onOutside;

  useEffect(() => {
    if (!enabled) return;
    const onMouse = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) cb.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cb.current();
    };
    document.addEventListener("mousedown", onMouse);
    if (closeOnEsc) document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouse);
      if (closeOnEsc) document.removeEventListener("keydown", onKey);
    };
  }, [ref, enabled, closeOnEsc]);
}
