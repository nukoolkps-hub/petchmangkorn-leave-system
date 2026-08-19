/* ─── Submit-Leave Confirm Modal ────────────────────────────────
   ขึ้นก่อนยื่นใบลาจริง — สรุปประเภท/ช่วงวัน/จำนวนวัน ให้พนักงานยืนยันก่อน
   เพื่อกันการกดผิด · เปิดเฉพาะเมื่อ validate ผ่านแล้ว */

import {
  CalendarRange as IconCalendarRange,
  Check as IconCheck,
} from "lucide-react";
import { LEAVE_TYPES } from "../../constants";
import { fmtDate } from "../../utils/dateUtils";
import BaseModal from "../shared/BaseModal";
import Spinner from "../shared/Spinner";

interface Props {
  type: string;
  startDate: string;
  endDate: string;
  days: number;
  saving?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function SubmitLeaveConfirmModal({
  type,
  startDate,
  endDate,
  days,
  saving = false,
  onConfirm,
  onCancel,
}: Props) {
  const lt = LEAVE_TYPES.find((t) => t.id === type);
  return (
    <BaseModal
      onClose={saving ? () => {} : onCancel}
      zIndexClass="z-1000"
      maxWidthClass="max-w-[360px]"
      overlayClassName="px-6 bg-[rgba(45,26,14,0.55)] backdrop-blur-xs"
      contentClassName="rounded-[20px] px-6 py-7"
    >
      <div className="w-14 h-14 rounded-full bg-gold-pale flex items-center justify-center mx-auto mb-4 border border-[#C9973A40]">
        <IconCalendarRange
          size={26}
          color="var(--color-maroon)"
          strokeWidth={2.4}
        />
      </div>
      <div className="font-bold text-lg text-txt text-center mb-2">
        ยืนยันยื่นใบลา?
      </div>
      <div className="text-sm text-txt-mid text-center mb-5 leading-[1.8]">
        <span className="inline-flex items-center gap-1.5 align-middle font-bold">
          {lt?.Icon && (
            <lt.Icon size={14} strokeWidth={2.2} style={{ color: lt.color }} />
          )}
          {lt?.label}
        </span>
        <br />
        {fmtDate(startDate)}
        {startDate !== endDate ? ` – ${fmtDate(endDate)}` : ""}
        <br />
        <span className="text-sm text-txt-soft">({days} วันทำการ)</span>
      </div>
      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="basis-[34%] shrink-0 p-3.5 rounded-xl border-[1.5px] border-bdr bg-white text-txt-mid text-base font-semibold cursor-pointer font-[inherit] disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-transform duration-100"
        >
          ยกเลิก
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={saving}
          className="flex-1 p-3.5 rounded-xl border-none bg-linear-135 from-maroon to-maroon-lt text-white text-base font-bold cursor-pointer font-[inherit] disabled:opacity-60 disabled:cursor-not-allowed shadow-[0_4px_12px_rgba(123,28,28,0.31)] inline-flex items-center justify-center gap-2"
        >
          {saving ? (
            <Spinner size={16} />
          ) : (
            <IconCheck size={16} strokeWidth={2.6} />
          )}
          {saving ? "กำลังบันทึก..." : "ยืนยันยื่นคำขอ"}
        </button>
      </div>
    </BaseModal>
  );
}
