import { Check as IconCheck } from "lucide-react";

/* ─── Leave Type Selection Card ──────────────────────────────────
   พื้นหลัง = lt.colorLt (สีอ่อนของแต่ละประเภท จาก LEAVE_TYPES) เสมอ
   ตัวอักษร = lt.color (สีเข้มของประเภท) เสมอ
   ตอนเลือก: เพิ่ม border 2px + checkmark มุมขวาบน + shadow                */
export default function LeaveTypeCard({
  lt,
  selected,
  onClick,
  balance,
  used,
}) {
  const sel = selected === lt.id;
  const _left = balance - used;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: lt.colorLt,
        borderColor: sel ? lt.color : "transparent",
        boxShadow: sel
          ? `0 4px 18px ${lt.color}30`
          : "0 1px 4px rgba(90,30,10,0.06)",
      }}
      className="rounded-2xl cursor-pointer font-[inherit] relative px-3 pt-5 pb-4 border-2 transition-[border-color,box-shadow,transform] duration-150 ease-out active:scale-[0.98]"
    >
      {sel && (
        <div
          className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full flex items-center justify-center animate-[fadeIn_0.18s_ease-out]"
          style={{ background: lt.color }}
        >
          <IconCheck size={11} color="#fff" strokeWidth={3} />
        </div>
      )}
      <div className="flex justify-center mb-2.5" style={{ color: lt.color }}>
        <lt.Icon size={32} strokeWidth={2} />
      </div>
      <div className="font-bold text-lg" style={{ color: lt.color }}>
        {lt.label}
      </div>
    </button>
  );
}
