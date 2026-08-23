/* ─── ModalHeader — หัวโมดอลมาตรฐาน (icon + title + subtitle + ปิด) ──
   sticky bar บนสุดของ BaseModal · ใช้ร่วมกันทุกโมดอลที่มีหัวแบบนี้
   (DutyForecastModal, RoleMainDutiesModal, ฯลฯ) — แก้สไตล์ที่เดียว */

import { X as IconX, type LucideIcon } from "lucide-react";

interface Props {
  Icon: LucideIcon;
  title: string;
  subtitle?: string;
  onClose: () => void;
}

export default function ModalHeader({ Icon, title, subtitle, onClose }: Props) {
  return (
    <div className="sticky top-0 z-10 bg-cream px-5 py-4 border-b border-bdr flex items-center gap-3">
      <div className="w-10 h-10 rounded-[11px] bg-gold-pale flex items-center justify-center shrink-0">
        <Icon size={20} strokeWidth={2.4} className="text-maroon" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-extrabold text-lg text-txt">{title}</div>
        {subtitle && (
          <div className="text-xs text-txt-soft mt-0.5 truncate">
            {subtitle}
          </div>
        )}
      </div>
      <button
        type="button"
        aria-label="ปิด"
        onClick={onClose}
        className="w-9 h-9 rounded-[10px] border border-bdr bg-white text-txt-mid cursor-pointer flex items-center justify-center transition-all duration-150 hover:bg-cream-dk active:scale-95 active:bg-cream"
      >
        <IconX size={18} strokeWidth={2.3} />
      </button>
    </div>
  );
}
