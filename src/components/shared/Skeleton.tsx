/* ─── Skeleton — placeholder ระหว่างข้อมูลกำลังโหลด ───────────────────
   แถบไล่เฉด shimmer โทน cream/gold (เข้า theme) · ใช้แทน "กำลังโหลด..."
   ตัวหนังสือเปล่าๆ ให้รู้สึกลื่น/มีโครงร่างก่อนข้อมูลจริงจะ fade เข้ามา
   เคารพ prefers-reduced-motion (global reset หยุด animation ให้เอง)        */

interface SkeletonProps {
  /** ความกว้าง/สูง + ระยะห่าง ใส่ผ่าน Tailwind class (เช่น "w-2/3 h-4") */
  className?: string;
  /** ความโค้งมุม · default rounded-md */
  rounded?: string;
}

export default function Skeleton({
  className = "",
  rounded = "rounded-md",
}: SkeletonProps) {
  // base โทน cream-dark + แถบแสง overlay ที่วิ่งด้วย translateX (GPU)
  // overflow-hidden ครอบไว้ให้แสงวิ่งอยู่ในกรอบ
  return (
    <div
      aria-hidden="true"
      className={`relative overflow-hidden bg-[rgba(240,228,204,0.6)] ${rounded} ${className}`}
    >
      <div className="absolute inset-0 animate-[shimmer_1.4s_ease-in-out_infinite] bg-[linear-gradient(90deg,transparent,rgba(245,230,200,0.9),transparent)]" />
    </div>
  );
}

/* การ์ด skeleton ทรงรายการทั่วไป (avatar กลม + บรรทัดข้อความ 2 แถว)
   ใช้ซ้ำในลิสต์ที่กำลังโหลด เช่น คำขอเบิก/ใบลา */
export function SkeletonRow({ className = "" }: { className?: string }) {
  return (
    <div
      className={`bg-white rounded-2xl p-4 border border-bdr flex items-center gap-3 ${className}`}
    >
      <Skeleton className="w-10 h-10 shrink-0" rounded="rounded-full" />
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <Skeleton className="w-1/2 h-3.5" />
        <Skeleton className="w-3/4 h-3" />
      </div>
      <Skeleton className="w-14 h-7" rounded="rounded-lg" />
    </div>
  );
}
