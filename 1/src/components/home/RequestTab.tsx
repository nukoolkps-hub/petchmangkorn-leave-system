/* ─── RequestTab — Leave request form + history ──────────────── */

import {
  AlertCircle as IconAlertCircle,
  AlertTriangle as IconAlertTriangle,
  CalendarDays as IconCalendar,
  CalendarRange as IconCalendarRange,
  ChevronRight as IconChevronRight,
  ClipboardList as IconClipboardList,
  ShieldCheck as IconShieldCheck,
  Sun as IconSun,
  Trash2 as IconTrash,
} from "lucide-react";
import { useMemo, useState } from "react";
import { BUSINESS_RULES, COLORS, LEAVE_TYPES } from "../../constants";
import type { LeaveEntry, StoreCalendar } from "../../types";
import { addDaysYmd, fmtDate, isFuture, todayYmd } from "../../utils/dateUtils";
import { countWeekdayLeaves, leaveOverlapsMonth } from "../../utils/leaveUtils";
import { isStoreClosed, isSunday } from "../../utils/storeCalendar";
import ConfirmModal from "../modals/ConfirmModal";
import SubmitLeaveConfirmModal from "../modals/SubmitLeaveConfirmModal";
import CalendarPicker from "../shared/CalendarPicker";
import GoldDivider from "../shared/GoldDivider";
import MonthChevronNav from "../shared/MonthChevronNav";
import LeaveTypeCard from "./LeaveTypeCard";

/** ลาป่วยล่วงหน้าได้สูงสุด 2 อาทิตย์ */
const SICK_LEAVE_MAX_AHEAD_DAYS = 14;

/** ใบลานี้คร่อมวันอาทิตย์ที่ "ร้านเปิด" ไหม — อาทิตย์เปิดจะถูกหัก × 1.5
 *  (อาทิตย์ปิดพิเศษใน extraClosedSundays ไม่นับ เพราะร้านปิด ลาไม่กระทบ) */
function hasDeductibleSunday(
  start: string,
  end: string,
  calendar?: StoreCalendar | null,
): boolean {
  let d = start;
  while (d <= end) {
    if (isSunday(d) && !isStoreClosed(d, calendar)) return true;
    d = addDaysYmd(d, 1);
  }
  return false;
}

interface RequestTabProps {
  profile: any;
  allLeaves: LeaveEntry[];
  form: { type: string; startDate: string; endDate: string };
  setForm: React.Dispatch<
    React.SetStateAction<{ type: string; startDate: string; endDate: string }>
  >;
  errors: Record<string, string>;
  histDetail: string | number | null;
  setHistDetail: (id: string | number | null) => void;
  myLeaves: LeaveEntry[];
  balance: Record<string, number>;
  used: Record<string, number>;
  days: number;
  remain: number | null;
  overLimit: boolean;
  /** validate form + show inline errors · return true ถ้าพร้อมยื่น */
  onValidate: () => boolean;
  onSubmit: () => void;
  /** ล้างฟอร์ม (type + วันที่ + errors) — ใช้ตอนกด "ยกเลิก" ก่อนยื่น */
  onResetForm: () => void;
  onDelete: (id: string | number) => void;
  storeCalendar?: StoreCalendar | null;
}

export default function RequestTab({
  profile,
  allLeaves,
  form,
  setForm,
  errors,
  histDetail,
  setHistDetail,
  myLeaves,
  balance,
  used,
  days,
  remain,
  overLimit,
  onValidate,
  onSubmit,
  onResetForm,
  onDelete,
  storeCalendar,
}: RequestTabProps) {
  const [confirmLeave, setConfirmLeave] = useState<LeaveEntry | null>(null);
  // confirm modal ก่อนยื่นใบลาจริง · เปิดเมื่อ validate ผ่านแล้วเท่านั้น
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [submittingLeave, setSubmittingLeave] = useState(false);
  const [selectedHistMonth, setSelectedHistMonth] = useState("");

  function handleClickSubmit() {
    if (!onValidate()) return; // errors แสดง inline ผ่าน errors prop
    setShowSubmitConfirm(true);
  }
  async function handleConfirmSubmit() {
    setSubmittingLeave(true);
    try {
      await onSubmit();
      setShowSubmitConfirm(false);
    } finally {
      setSubmittingLeave(false);
    }
  }

  /* ─── ประวัติการลา — แยกดูเป็นรายเดือน ────────────────────────── */
  // todayYmd() เรียกตอน render เพื่อไม่ stale ข้าม midnight (constants.TODAY
  // คงค่าตอน module import) · sickMaxDate cap ปฏิทินลาป่วยที่ +14 วัน
  const todayStr = todayYmd();
  const currentMonth = todayStr.slice(0, 7);
  const sickMaxDate = addDaysYmd(todayStr, SICK_LEAVE_MAX_AHEAD_DAYS);
  // ช่วงเดือนที่เลื่อนดูได้ (ต่อเนื่อง · ใหม่→เก่า) — ครอบทั้งเดือนปัจจุบัน
  // และทุกเดือนที่มีใบลา (รวมใบลาล่วงหน้าในอนาคต)
  const navMonths = useMemo(() => {
    const all = [currentMonth, ...myLeaves.map((lv) => lv.start.slice(0, 7))];
    const maxYm = all.reduce((a, b) => (b > a ? b : a), all[0]);
    const minYm = all.reduce((a, b) => (b < a ? b : a), all[0]);
    const out: string[] = [];
    let [y, m] = maxYm.split("-").map(Number);
    const [minY, minM] = minYm.split("-").map(Number);
    while (y > minY || (y === minY && m >= minM)) {
      out.push(`${y}-${String(m).padStart(2, "0")}`);
      m -= 1;
      if (m === 0) {
        m = 12;
        y -= 1;
      }
    }
    return out;
  }, [myLeaves, currentMonth]);
  // เดือนที่กำลังดู — default = เดือนปัจจุบัน (แม้ไม่มีใบลา) · กันค่าค้าง
  const effectiveHistMonth = navMonths.includes(selectedHistMonth)
    ? selectedHistMonth
    : currentMonth;
  // เลือก leaves ที่ overlap กับเดือนที่ดู — ใบลาคร่อมเดือน (พ.ค. 30 →
  // มิ.ย. 2) ต้องโผล่ทั้งสองเดือน · เปรียบเทียบ YYYY-MM lexicographic
  const monthLeaves = useMemo(
    () =>
      myLeaves
        .filter(
          (lv) =>
            lv.start.slice(0, 7) <= effectiveHistMonth &&
            lv.end.slice(0, 7) >= effectiveHistMonth,
        )
        .sort((a, b) => b.start.localeCompare(a.start)),
    [myLeaves, effectiveHistMonth],
  );
  // จำนวนใบลาสูงสุดในเดือนใดเดือนหนึ่ง → ใช้กำหนด min-height ของลิสต์
  // ให้สูงคงที่ · เปลี่ยนเดือนแล้วหน้าไม่หด/ไม่เด้งขึ้น (scroll ไม่กระโดด)
  // ใช้ overlap เดียวกับ monthLeaves: นับทุกเดือนที่ใบลาคร่อม
  const maxMonthCount = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const lv of myLeaves) {
      const startYm = lv.start.slice(0, 7);
      const endYm = lv.end.slice(0, 7);
      // ทุกเดือนตั้งแต่ startYm ถึง endYm
      let [y, m] = startYm.split("-").map(Number);
      const [endY, endM] = endYm.split("-").map(Number);
      while (y < endY || (y === endY && m <= endM)) {
        const k = `${y}-${String(m).padStart(2, "0")}`;
        counts[k] = (counts[k] || 0) + 1;
        m += 1;
        if (m === 13) {
          m = 1;
          y += 1;
        }
      }
    }
    return Math.max(1, ...Object.values(counts));
  }, [myLeaves]);

  /* ─── Quota status for this month — count weekday days (Mon-Fri)
       1 ใบลา 4 วันธรรมดา = 4 ไม่ใช่ 1 · sunday แยกหัก ไม่นับโควต้า */
  const monthLeavesForQuota = profile
    ? allLeaves.filter(
        (lv: LeaveEntry) =>
          lv.employeeId === profile.id && leaveOverlapsMonth(lv, currentMonth),
      )
    : [];
  const usedThisMonth = countWeekdayLeaves(
    monthLeavesForQuota,
    storeCalendar,
    currentMonth,
  );
  const quota = BUSINESS_RULES.WEEKDAY_LEAVE_QUOTA;
  const rem = quota - usedThisMonth;
  const overQuota = usedThisMonth >= quota;

  return (
    <div>
      {/* quota status in form */}
      <div
        className={`rounded-xl px-4 py-3 mb-5 flex items-center gap-3 border-[1.5px] ${overQuota ? "bg-[#FEF2F2] border-[#C0392B50]" : "bg-gold-pale border-[#C9973A50]"}`}
      >
        <div className={`shrink-0 ${overQuota ? "text-red" : "text-maroon"}`}>
          {overQuota ? (
            <IconAlertTriangle size={26} strokeWidth={2.2} />
          ) : (
            <IconClipboardList size={26} strokeWidth={2.2} />
          )}
        </div>
        <div className="flex-1">
          <div
            className={`font-bold text-sm ${overQuota ? "text-red" : "text-maroon"}`}
          >
            {overQuota
              ? "หมดโควต้าแล้ว - การลาครั้งถัดไปจะกระทบต่อเงินเดือน"
              : `โควต้าเดือนนี้เหลือ ${rem} วัน`}
          </div>
          <div className="text-sm text-txt-soft mt-0.5">
            ลากิจ + ลาป่วย รวม 2 วัน/เดือน
          </div>
          <div className="text-xs text-txt-soft mt-0.5">
            นับเฉพาะวันธรรมดา · วันอาทิตย์หักแยก (ไม่กินโควต้า)
          </div>
        </div>
        <div className="text-right shrink-0">
          <div
            className={`text-xl font-extrabold ${overQuota ? "text-red" : "text-gold"}`}
          >
            {usedThisMonth}
          </div>
          <div className="text-xs text-txt-soft">/ 2 วัน</div>
        </div>
      </div>

      <div className="mb-5.5">
        <div className="text-base font-bold text-txt mb-3">ประเภทการลา</div>
        <div className="grid grid-cols-2 gap-3">
          {LEAVE_TYPES.map((lt) => (
            <LeaveTypeCard
              key={lt.id}
              lt={lt}
              selected={form.type}
              onClick={() =>
                setForm((f) => {
                  if (lt.id !== "sick") return { ...f, type: lt.id };
                  // เปลี่ยนเป็นลาป่วย → ล้างวันที่ล่วงหน้าเกิน 2 อาทิตย์
                  const nextStart =
                    !f.startDate || f.startDate <= sickMaxDate
                      ? f.startDate
                      : "";
                  const endOk = !f.endDate || f.endDate <= sickMaxDate;
                  return {
                    type: lt.id,
                    startDate: nextStart,
                    endDate: endOk ? f.endDate : "",
                  };
                })
              }
              balance={balance[lt.id] || 15}
              used={used[lt.id] || 0}
            />
          ))}
        </div>
        {errors.type && (
          <div className="text-red text-sm mt-2 inline-flex items-center gap-1 animate-[fadeIn_0.2s_ease-out]">
            <IconAlertTriangle size={14} strokeWidth={2.4} />
            {errors.type}
          </div>
        )}
      </div>
      <div className="text-base font-bold text-txt mb-2">วันที่เริ่มลา</div>
      <CalendarPicker
        value={form.startDate}
        onChange={(v) =>
          setForm((f) => ({
            ...f,
            startDate: v,
            // ล้าง endDate ถ้าก่อน startDate ใหม่
            endDate: f.endDate && f.endDate < v ? "" : f.endDate,
          }))
        }
        minDate={todayStr}
        // ลาป่วย → เลือกล่วงหน้าได้ไม่เกิน 2 อาทิตย์
        maxDate={form.type === "sick" ? sickMaxDate : undefined}
        storeCalendar={storeCalendar}
        error={errors.startDate}
      />
      <div className="text-base font-bold text-txt mb-2 mt-1">วันที่สิ้นสุด</div>
      <CalendarPicker
        value={form.endDate}
        onChange={(v) => setForm((f) => ({ ...f, endDate: v }))}
        minDate={form.startDate || todayStr}
        // ลาป่วย → เลือกล่วงหน้าได้ไม่เกิน 2 อาทิตย์
        maxDate={form.type === "sick" ? sickMaxDate : undefined}
        storeCalendar={storeCalendar}
        error={errors.endDate}
      />
      {days > 0 && (
        <div
          className={`rounded-2xl px-5 py-4 my-3.5 flex flex-col items-center text-center border-[1.5px] animate-[slideUp_0.2s_ease-out] ${overLimit ? "bg-red-lt border-[#C0392B40]" : "bg-gold-pale border-[#C9973A60]"}`}
        >
          <div
            className={`text-sm font-semibold inline-flex items-center gap-1.5 ${overLimit ? "text-red" : "text-txt-mid"}`}
          >
            {overLimit ? (
              <IconAlertCircle size={14} color={COLORS.red} strokeWidth={2.5} />
            ) : (
              <IconCalendarRange
                size={14}
                color={COLORS.maroon}
                strokeWidth={2.4}
              />
            )}
            รวมจำนวนวันทำการ
          </div>
          <div
            className={`text-4xl font-extrabold leading-[1.05] mt-1.5 ${overLimit ? "text-red" : "text-maroon"}`}
          >
            {days}
            <span className="text-lg font-semibold ml-1">วัน</span>
          </div>
          <div
            className={`text-xs mt-1.5 ${overLimit ? "text-red" : "text-txt-soft"}`}
          >
            {overLimit ? (
              <span className="inline-flex items-center gap-1">
                <IconAlertTriangle size={12} strokeWidth={2.4} />
                เกินสิทธิ์! คงเหลือ {remain} วัน
              </span>
            ) : (
              "(ไม่รวมวันที่ร้านปิด)"
            )}
          </div>
        </div>
      )}
      {errors.over && (
        <div className="text-red text-sm mx-0 mt-1 mb-2.5 inline-flex items-center gap-1">
          <IconAlertTriangle size={14} strokeWidth={2.4} />
          {errors.over}
        </div>
      )}

      <div className="flex gap-2.5 mt-1.5">
        <button
          type="button"
          onClick={onResetForm}
          className="basis-[34%] shrink-0 py-3.5 rounded-2xl border-[1.5px] border-bdr bg-white text-txt-mid text-base font-semibold cursor-pointer font-[inherit] active:scale-[0.98] transition-transform duration-100"
        >
          ยกเลิก
        </button>
        <button
          type="button"
          onClick={handleClickSubmit}
          className="flex-1 py-3.5 border-none rounded-2xl text-base font-bold cursor-pointer font-[inherit] flex items-center justify-center gap-2.5 bg-linear-135 from-maroon to-maroon-lt text-white shadow-[0_4px_14px_rgba(123,28,28,0.25)]"
        >
          ยื่นคำขอลา
        </button>
      </div>
      {showSubmitConfirm && (
        <SubmitLeaveConfirmModal
          type={form.type}
          startDate={form.startDate}
          endDate={form.endDate}
          days={days}
          saving={submittingLeave}
          onConfirm={handleConfirmSubmit}
          onCancel={() => setShowSubmitConfirm(false)}
        />
      )}

      {/* ── ประวัติการลาของคุณ ── */}
      <div className="mt-8">
        <GoldDivider />
        <div className="flex items-center gap-2 mb-3.5">
          <div className="text-base font-bold text-txt flex items-center gap-2">
            <IconClipboardList
              size={16}
              strokeWidth={2.4}
              className="text-maroon"
            />
            ประวัติการลาของคุณ
          </div>
          <div className="ml-auto">
            <MonthChevronNav
              months={navMonths}
              selected={effectiveHistMonth}
              onSelect={setSelectedHistMonth}
              subtitle={`${monthLeaves.length} รายการ`}
            />
          </div>
        </div>
        {/* min-height คงที่ตามเดือนที่ใบลาเยอะสุด → สลับเดือนแล้วหน้าไม่หด/เด้ง */}
        <div style={{ minHeight: maxMonthCount * 78 }}>
          {monthLeaves.length === 0 ? (
            <div className="text-center text-txt-soft py-7.5 text-sm bg-cream rounded-[14px] border border-dashed border-bdr">
              ไม่มีใบลาในเดือนนี้
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {monthLeaves.map((h) => {
                const lt = LEAVE_TYPES.find((t) => t.id === h.type);
                return (
                  <div
                    key={h.id}
                    onClick={() =>
                      setHistDetail(histDetail === h.id ? null : h.id)
                    }
                    className="bg-white rounded-[14px] p-3.5 shadow-[0_2px_10px_rgba(90,30,10,0.06)] border border-bdr flex items-start gap-3 cursor-pointer"
                  >
                    <div
                      className="w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0"
                      style={{
                        background: lt?.colorLt || COLORS.creamDark,
                        color: lt?.color || COLORS.textMedium,
                      }}
                    >
                      {lt?.Icon && <lt.Icon size={20} strokeWidth={2.2} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-txt text-base mb-0.5 flex items-center gap-1.5 flex-wrap">
                        {lt?.label}
                        {h.createdByAdmin && (
                          <span className="text-xs font-extrabold tracking-wide px-1.5 py-1 rounded-[10px] bg-maroon text-white border border-maroon inline-flex items-center gap-0.5">
                            <IconShieldCheck size={10} strokeWidth={2.6} />
                            ADMIN
                          </span>
                        )}
                        {hasDeductibleSunday(h.start, h.end, storeCalendar) && (
                          <span className="text-xs font-extrabold tracking-wide px-1.5 py-1 rounded-[10px] bg-amber-lt text-amber border border-amber/40 inline-flex items-center gap-0.5">
                            <IconSun size={10} strokeWidth={2.6} />
                            อาทิตย์ ×1.5
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-txt-mid">
                        {fmtDate(h.start)}
                        {h.start !== h.end ? ` – ${fmtDate(h.end)}` : ""} (
                        {h.days} วันทำการ)
                      </div>
                      {histDetail === h.id && (
                        <div className="text-sm text-txt-soft mt-1.5 pt-1.5 border-t border-dashed border-bdr flex items-center gap-1.5">
                          <IconCalendar size={12} strokeWidth={2.4} />
                          วันที่ยื่น: {h.submitted}
                        </div>
                      )}
                    </div>
                    {isFuture(h.start) && (
                      <button
                        type="button"
                        aria-label="ลบใบลา"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmLeave(h);
                        }}
                        className="w-9 h-9 rounded-[10px] bg-red-lt flex items-center justify-center cursor-pointer shrink-0 border-[1.5px] border-[#C0392B30]"
                      >
                        <IconTrash
                          size={16}
                          color={COLORS.red}
                          strokeWidth={2.2}
                        />
                      </button>
                    )}
                    <IconChevronRight
                      size={14}
                      color={COLORS.textSoft}
                      strokeWidth={2}
                      className={`shrink-0 mt-1 transition-transform duration-200 ${histDetail === h.id ? "rotate-90" : "rotate-0"}`}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        leave={confirmLeave}
        onConfirm={() => {
          if (confirmLeave) onDelete(confirmLeave.id);
          setConfirmLeave(null);
        }}
        onCancel={() => setConfirmLeave(null)}
      />
    </div>
  );
}
