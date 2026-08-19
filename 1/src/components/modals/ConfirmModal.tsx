import { Trash2 as IconTrash } from "lucide-react";
import { LEAVE_TYPES } from "../../constants";
import { fmtDate } from "../../utils/dateUtils";
import BaseModal from "../shared/BaseModal";

/* ─── Delete Confirm Modal ─────────────────────────────────────── */
export default function ConfirmModal({ leave, onConfirm, onCancel }) {
  if (!leave) return null;
  const lt = LEAVE_TYPES.find((t) => t.id === leave.type);
  return (
    <BaseModal
      onClose={onCancel}
      zIndexClass="z-1000"
      maxWidthClass="max-w-[360px]"
      overlayClassName="px-6 bg-[rgba(45,26,14,0.55)] backdrop-blur-xs"
      contentClassName="rounded-[20px] px-6 py-7"
    >
      <div className="w-14 h-14 rounded-full bg-red-lt flex items-center justify-center mx-auto mb-4">
        <IconTrash size={26} color="var(--color-red)" strokeWidth={2.5} />
      </div>
      <div className="font-bold text-lg text-txt text-center mb-2">
        ลบรายการลานี้?
      </div>
      <div className="text-sm text-txt-mid text-center mb-5 leading-[1.8]">
        <b>{leave.employeeNickname || leave.employeeName}</b>
        <br />
        <span className="inline-flex items-center gap-1.5 align-middle">
          {lt?.Icon && (
            <lt.Icon size={14} strokeWidth={2.2} style={{ color: lt.color }} />
          )}
          {lt?.label}
        </span>{" "}
        · {fmtDate(leave.start)}
        {leave.start !== leave.end ? ` – ${fmtDate(leave.end)}` : ""}
        <br />
        <span className="text-sm text-txt-soft">({leave.days} วันทำการ)</span>
      </div>
      <div className="flex gap-2.5">
        <button
          onClick={onCancel}
          className="flex-1 p-3.5 rounded-xl border-[1.5px] border-bdr bg-white text-txt-mid text-base font-semibold cursor-pointer font-[inherit] active:scale-[0.98] transition-transform duration-100"
        >
          ยกเลิก
        </button>
        <button
          onClick={onConfirm}
          className="flex-1 p-3.5 rounded-xl border-none bg-red text-white text-base font-bold cursor-pointer font-[inherit] shadow-[0_4px_12px_rgba(192,57,43,0.31)] active:scale-[0.98] transition-transform duration-100"
        >
          ลบรายการ
        </button>
      </div>
    </BaseModal>
  );
}
