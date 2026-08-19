/* ─── SuccessScreen — Leave request success confirmation ──────── */

import { Check as IconCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { LEAVE_TYPES } from "../../constants";
import { fmtDate } from "../../utils/dateUtils";

interface SuccessScreenProps {
  form: { type: string; startDate: string; endDate: string };
  days: number;
  onReset: () => void;
}

export default function SuccessScreen({
  form,
  days,
  onReset,
}: SuccessScreenProps) {
  const navigate = useNavigate();

  return (
    <div className="text-center pt-10 pb-5">
      <div className="w-20 h-20 rounded-full bg-linear-to-br from-gold to-gold-lt flex items-center justify-center mx-auto mb-5 shadow-[0_8px_28px_rgba(201,151,58,0.27)]">
        <IconCheck size={36} color="#fff" strokeWidth={2.5} />
      </div>
      <h2 className="text-maroon font-extrabold text-2xl m-0 mb-2">
        ส่งคำขอสำเร็จ!
      </h2>
      <p className="text-txt-mid text-base m-0 mb-5.5">
        บันทึกรายการลาของคุณเรียบร้อยแล้ว
      </p>
      <div className="bg-gold-pale border border-gold/30 rounded-2xl px-5 py-4 mx-auto mb-6.5 inline-block">
        <div className="text-base text-txt font-bold">
          {LEAVE_TYPES.find((t) => t.id === form.type)?.label} ·{" "}
          {fmtDate(form.startDate)}
          {form.startDate !== form.endDate ? ` – ${fmtDate(form.endDate)}` : ""}
        </div>
        <div className="text-sm text-txt-mid mt-1">{days} วันทำการ</div>
      </div>
      <div className="flex justify-center">
        <button
          onClick={() => {
            onReset();
            navigate("/home");
          }}
          className="px-6 py-3.5 bg-maroon text-white border-none rounded-[14px] text-base font-bold cursor-pointer font-[inherit] shadow-[0_4px_14px_rgba(123,28,28,0.25)]"
        >
          กลับหน้าแรก
        </button>
      </div>
    </div>
  );
}
