/* ─── useStableScrollOnReflow — กัน "หน้าจอขยับ" ตอนพิมพ์ในช่องกรอก ──────
   ปัญหา: ในหน้าที่คำนวณสด (เช่น ค่าคอม) พอพิมพ์ในช่อง "จำนวน" เนื้อหา
   เหนือช่อง (กล่องเตือน/สถานะกองกลาง) เปลี่ยนความสูง → ช่องถูกดันให้เลื่อน
   ตำแหน่ง → บนมือถือ caret ดูเหมือนไม่ตรง · iOS ไม่มี scroll anchoring
   จึงต้องชดเชยเอง

   วิธี: หลัง re-render แต่ละครั้ง ถ้ามี input/textarea ถูก focus อยู่ และ
   ตำแหน่งบนจอ (rect.top) ขยับจากเดิม → window.scrollBy ชดเชยให้ช่องอยู่ที่
   เดิมบนจอ

   ปลอดภัย:
   - ทำเฉพาะตอน input/textarea ถูก focus
   - useLayoutEffect รันเฉพาะตอน React re-render (การ scroll เองของ user
     ไม่ทำให้ re-render → ไม่สู้กับ user) · อัปเดต baseline จาก scroll event
     ของ user ด้วย เผื่อ user เลื่อนระหว่างพิมพ์
   - ข้าม delta ใหญ่ผิดปกติ (≥ 240px = น่าจะตั้งใจเลื่อน/เปลี่ยนหน้า)
   - selfScroll flag กัน scroll event ที่เกิดจาก scrollBy ของเราเองวนลูป   */

import { useEffect, useLayoutEffect, useRef } from "react";

function isField(el: Element | null): el is HTMLElement {
  return (
    !!el &&
    (el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      el.tagName === "SELECT")
  );
}

export function useStableScrollOnReflow(): void {
  const baseline = useRef<number | null>(null);
  const selfScroll = useRef(false);

  useEffect(() => {
    const onScroll = () => {
      // ข้าม scroll ที่เราสั่งเอง (กัน feedback loop)
      if (selfScroll.current) {
        selfScroll.current = false;
        return;
      }
      const el = document.activeElement;
      if (isField(el)) baseline.current = el.getBoundingClientRect().top;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useLayoutEffect(() => {
    const el = document.activeElement;
    if (!isField(el)) {
      baseline.current = null;
      return;
    }
    const top = el.getBoundingClientRect().top;
    if (baseline.current == null) {
      baseline.current = top;
      return;
    }
    const delta = top - baseline.current;
    // ช่องขยับจาก reflow เหนือมัน → ชดเชยให้กลับที่เดิมบนจอ
    if (Math.abs(delta) > 1 && Math.abs(delta) < 240) {
      selfScroll.current = true;
      window.scrollBy(0, delta);
    }
    baseline.current = el.getBoundingClientRect().top;
  });
}
