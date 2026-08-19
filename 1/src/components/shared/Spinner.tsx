/* ─── Spinner — ไอคอนหมุนระหว่างทำงาน (in-flight) ───────────────────
   ใช้ในปุ่มตอนกำลังบันทึก/ส่ง ให้เห็นชัดว่า "กำลังทำงาน" ไม่ใช่แค่ข้อความ
   เคารพ prefers-reduced-motion (global reset หยุด animation ให้)          */

import { Loader2 as IconLoader } from "lucide-react";

interface SpinnerProps {
  size?: number;
  className?: string;
}

export default function Spinner({ size = 18, className = "" }: SpinnerProps) {
  return (
    <IconLoader
      size={size}
      strokeWidth={2.4}
      aria-hidden="true"
      className={`animate-spin ${className}`}
    />
  );
}
