/* ─── ToggleSwitch — สวิตช์เปิด/ปิด (iOS-style) ใช้ทั้งระบบ ──────────
   knob เลื่อน (transform) + พื้นเปลี่ยนสี (เขียว=เปิด) พร้อมกัน · 200ms
   GPU-accelerated → ลื่น 60fps · ตัว switch อย่างเดียว (ไม่มี label/กดเอง)
   ผู้เรียกครอบ <button onClick> + label เอง                              */

interface ToggleSwitchProps {
  enabled: boolean;
  disabled?: boolean;
}

export default function ToggleSwitch({
  enabled,
  disabled = false,
}: ToggleSwitchProps) {
  // flex items-center → knob กึ่งกลางแนวตั้งเสมอ (เลี่ยง margin collapse
  // ที่ทำให้ knob ติดขอบบน) · translate-x ขยับแนวนอน
  return (
    <div
      className={`shrink-0 w-11 h-6 rounded-full flex items-center transition-colors duration-200 ${
        enabled ? "bg-green" : "bg-bdr"
      } ${disabled ? "opacity-60" : ""}`}
    >
      <div
        className={`w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ${
          enabled ? "translate-x-[22px]" : "translate-x-0.5"
        }`}
      />
    </div>
  );
}
