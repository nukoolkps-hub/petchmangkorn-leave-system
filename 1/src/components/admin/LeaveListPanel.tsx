import {
  Briefcase as IconBriefcase,
  ChevronDown as IconChevronDown,
  Cross as IconCross,
  FastForward as IconFastForward,
  Plus as IconPlus,
  ShieldCheck as IconShieldCheck,
  Trash2 as IconTrash,
  X as IconX,
} from "lucide-react";
import { useMemo, useState } from "react";
import { COLORS, LEAVE_TYPES, TODAY } from "../../constants";
import type { Employee, LeaveEntry, LeaveKind } from "../../types";
import {
  countWorkdays,
  fmtDateWithWeekday,
  isFuture,
} from "../../utils/dateUtils";
import ConfirmModal from "../modals/ConfirmModal";
import AvatarCircle from "../shared/AvatarCircle";
import CalendarPicker from "../shared/CalendarPicker";
import MonthChevronNav from "../shared/MonthChevronNav";
import { SkeletonRow } from "../shared/Skeleton";
import ThemedSelect from "../shared/ThemedSelect";

interface LeaveListPanelProps {
  allLeaves: LeaveEntry[];
  /** leaves sub ยังโหลดอยู่ไหม → แสดง skeleton แทน "ไม่มีรายการ" ตอนยังว่าง */
  leavesLoading?: boolean;
  employeeDirectory: Employee[];
  storeCalendar?: import("../../types").StoreCalendar | null;
  onDelete: (id: string | number) => void;
  onAddLeave: (
    leave: Omit<LeaveEntry, "id">,
  ) => Promise<string | number | undefined>;
  /** เดือนที่ดู (YYYY-MM) — controlled โดย AdminPanel ผ่าน prop · admin
   *  ที่เลือก ส.ค. ในแท็บค่าคอม → ไปแท็บนี้ ยังเป็น ส.ค. */
  selectedMonth: string;
  onSelectMonth: (month: string) => void;
  showToast?: (msg: string) => void;
}

/* ─── Admin: Leave List (เพิ่ม + รายการ + filter + ลบ) ─────────── */
export default function LeaveListPanel({
  allLeaves,
  leavesLoading,
  employeeDirectory,
  storeCalendar,
  onDelete,
  onAddLeave,
  selectedMonth,
  onSelectMonth,
  showToast,
}: LeaveListPanelProps) {
  const [confirmLeave, setConfirmLeave] = useState<any>(null);

  // navMonths = เดือนที่กำลังดู ∪ เดือนที่มีใบลา · เรียงใหม่→เก่า
  // โชว์เฉพาะเดือนที่มีข้อมูล (ไม่ยัดเดือนปัจจุบันที่ว่าง) · selectedMonth คงไว้
  // เสมอเพื่อให้ effectiveMonth = selectedMonth ตรงๆ + ลูกศรไม่หลุด list
  const navMonths = useMemo(
    () =>
      Array.from(
        new Set([
          selectedMonth,
          ...allLeaves.map((lv) => lv.start.slice(0, 7)),
        ]),
      ).sort((a, b) => b.localeCompare(a)),
    [allLeaves, selectedMonth],
  );
  const effectiveMonth = selectedMonth;

  /* ─── Add-leave form (collapsible) ─── */
  const [addOpen, setAddOpen] = useState(false);
  // true เมื่อ expand เสร็จ → ปลด overflow ให้ CalendarPicker popup ล้นออกได้
  // (ระหว่าง animate ต้อง overflow-hidden เพื่อ clip ความสูง)
  const [addSettled, setAddSettled] = useState(false);
  const [addEmpId, setAddEmpId] = useState("");
  const [addType, setAddType] = useState<LeaveKind>("personal");
  const [addStart, setAddStart] = useState("");
  const [addEnd, setAddEnd] = useState("");
  const [addReason, setAddReason] = useState("");
  const [saving, setSaving] = useState(false);

  function resetForm() {
    setAddEmpId("");
    setAddType("personal");
    setAddStart("");
    setAddEnd("");
    setAddReason("");
  }

  const previewDays =
    addStart && addEnd ? countWorkdays(addStart, addEnd, storeCalendar) : 0;
  const canSubmit =
    !!addEmpId && !!addStart && !!addEnd && addStart <= addEnd && !saving;

  async function handleAdd() {
    if (!canSubmit) return;
    const emp = employeeDirectory.find((e) => e.id === addEmpId);
    if (!emp) return;
    setSaving(true);
    try {
      await onAddLeave({
        employeeId: emp.id,
        employeeName: emp.name,
        // ?? null กัน Firestore reject undefined (config.ts ไม่ได้เปิด
        // ignoreUndefinedProperties · พนักงานที่ไม่ตั้งชื่อเล่นจะกลายเป็น undefined)
        employeeNickname: emp.nickname ?? null,
        type: addType,
        start: addStart,
        end: addEnd,
        days: previewDays,
        reason: addReason.trim(),
        submitted: TODAY,
        createdAt: Date.now(),
        createdByAdmin: true,
      });
      showToast?.(
        `เพิ่มการลาให้ ${emp.nickname || emp.name} แล้ว (${previewDays} วัน)`,
      );
      resetForm();
      setAddSettled(false);
      setAddOpen(false);
    } catch (err) {
      console.error("[LeaveList] addLeave failed:", err);
      showToast?.(err instanceof Error ? err.message : "เพิ่มการลาไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  // รายการลาทั้งหมด (รวมอนาคต) — admin ต้องเห็นทุกใบไม่ใช่แค่ที่ผ่านมาแล้ว
  // filter ด้วย employeeId (ไม่ใช่ชื่อ) — กันชื่อซ้ำ/เปลี่ยนชื่อ
  // overlap check แทน startsWith — ใบลาคร่อมเดือน (พ.ค. 30 → มิ.ย. 2)
  // ต้องเห็นทั้งสองเดือน · admin จะได้ลบ/แก้ได้ทั้งสองมุมมอง
  // memo: กัน re-filter ตอนพิมพ์ในฟอร์มเพิ่มลา (filter inputs ไม่เปลี่ยน)
  const filteredLeaves = useMemo(
    () =>
      allLeaves
        .filter(
          (lv) =>
            lv.start.slice(0, 7) <= effectiveMonth &&
            lv.end.slice(0, 7) >= effectiveMonth,
        )
        .sort((a, b) => b.start.localeCompare(a.start)),
    [allLeaves, effectiveMonth],
  );

  return (
    <div>
      {/* month picker — บนสุด ชิดขวา */}
      <div className="flex justify-end mb-2.5">
        <MonthChevronNav
          months={navMonths}
          selected={effectiveMonth}
          onSelect={onSelectMonth}
        />
      </div>
      {/* เพิ่มการลา — collapsible (สำหรับพนักงานที่ลืมกดลา) · expand แบบ smooth
          ด้วย grid-rows trick (เหมือน accordion ความรู้ฯ) · overflow-hidden
          เฉพาะตอน animate แล้วปลดเป็น visible ตอน expand เสร็จ ให้ CalendarPicker
          popup ล้นออกขอบฟอร์มได้ (addSettled) */}
      <div className="mb-3.5 rounded-[14px] border border-bdr bg-white">
        <button
          type="button"
          onClick={() => {
            // ปิดฟอร์ม → ทิ้ง draft (parity กับปุ่ม "ยกเลิก" inside form)
            if (addOpen) {
              resetForm();
              setAddSettled(false); // clip ระหว่างยุบ
            }
            setAddOpen((v) => !v);
          }}
          aria-expanded={addOpen}
          className={`w-full flex items-center gap-2 px-3.5 py-2.5 cursor-pointer font-[inherit] text-left active:scale-[0.995] transition-transform duration-100 rounded-t-[13px] ${addOpen ? "bg-maroon text-white" : "bg-gold-pale/40 text-maroon rounded-b-[13px]"}`}
        >
          <IconPlus
            size={16}
            strokeWidth={2.5}
            color={addOpen ? COLORS.gold : COLORS.maroon}
          />
          <span className="flex-1 text-sm font-extrabold">
            เพิ่มการลาให้พนักงาน
          </span>
          <IconChevronDown
            size={14}
            strokeWidth={2.5}
            className={`shrink-0 transition-transform duration-200 ${addOpen ? "rotate-180" : ""}`}
          />
        </button>
        {/* grid-rows trick: animate ความสูง smooth (เหมือน accordion ความรู้ฯ) ·
            content mount เสมอ · overflow-hidden เฉพาะตอน animate แล้วปลดเป็น
            visible เมื่อ expand เสร็จ (CalendarPicker popup ต้องล้นออกได้) */}
        <div
          className={`grid transition-[grid-template-rows] duration-200 ease-out ${
            addOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
          aria-hidden={!addOpen}
          onTransitionEnd={(e) => {
            if (e.propertyName === "grid-template-rows" && addOpen)
              setAddSettled(true);
          }}
        >
          <div
            className={
              addOpen && addSettled ? "overflow-visible" : "overflow-hidden"
            }
          >
            <div className="p-3.5 border-t border-bdr/40 flex flex-col gap-2.5">
              <ThemedSelect
                value={addEmpId}
                onChange={setAddEmpId}
                placeholder="— เลือกพนักงาน —"
                options={employeeDirectory.map((emp) => ({
                  value: emp.id,
                  label: emp.nickname || emp.name,
                }))}
                className="w-full flex items-center pl-3 pr-8 py-2.5 rounded-[10px] border-[1.5px] border-bdr text-sm text-txt bg-white font-[inherit] cursor-pointer text-left"
              />
              <ThemedSelect
                value={addType}
                onChange={(v) => setAddType(v as LeaveKind)}
                options={LEAVE_TYPES.map((lt) => ({
                  value: lt.id,
                  label: lt.label,
                }))}
                className="w-full flex items-center pl-3 pr-8 py-2.5 rounded-[10px] border-[1.5px] border-bdr text-sm text-txt bg-white font-[inherit] cursor-pointer text-left"
              />
              <div className="flex gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-txt-soft font-semibold mb-1">
                    ตั้งแต่
                  </div>
                  <CalendarPicker
                    value={addStart}
                    onChange={(v) => {
                      setAddStart(v);
                      if (!addEnd || addEnd < v) setAddEnd(v);
                    }}
                    storeCalendar={storeCalendar}
                    size="sm"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-txt-soft font-semibold mb-1">
                    ถึง
                  </div>
                  <CalendarPicker
                    value={addEnd}
                    onChange={setAddEnd}
                    minDate={addStart || undefined}
                    storeCalendar={storeCalendar}
                    size="sm"
                  />
                </div>
              </div>
              <input
                type="text"
                value={addReason}
                onChange={(e) => setAddReason(e.target.value)}
                placeholder="เหตุผล (ถ้ามี) — เช่น 'ลืมกดลา'"
                className="w-full px-3 py-2.5 rounded-[10px] border-[1.5px] border-bdr text-sm text-txt bg-white font-[inherit] outline-none focus:border-maroon"
              />
              {addStart && addEnd && (
                <div className="text-xs text-txt-mid bg-cream/50 rounded-[8px] px-3 py-2">
                  จำนวนวันลา (ไม่รวมวันที่ร้านปิด):{" "}
                  <span className="font-extrabold text-maroon">
                    {previewDays} วัน
                  </span>
                </div>
              )}
              <div className="flex gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setAddSettled(false);
                    setAddOpen(false);
                  }}
                  className="flex-1 px-3 py-2.5 rounded-[10px] border border-bdr bg-white text-txt-mid text-sm font-bold cursor-pointer font-[inherit] active:scale-[0.98] transition-transform inline-flex items-center justify-center gap-1.5"
                >
                  <IconX size={13} strokeWidth={2.5} />
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={!canSubmit}
                  className="flex-2 px-3 py-2.5 rounded-[10px] bg-maroon text-white text-sm font-extrabold cursor-pointer font-[inherit] disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition-transform inline-flex items-center justify-center gap-1.5"
                >
                  <IconPlus size={14} strokeWidth={2.5} />
                  {saving ? "กำลังบันทึก..." : "เพิ่มการลา"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {leavesLoading && allLeaves.length === 0 ? (
        <div className="flex flex-col gap-2.5 animate-[fadeIn_0.18s_ease-out]">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : filteredLeaves.length === 0 ? (
        <div className="text-center text-txt-soft py-10 text-base">
          ไม่มีรายการลาย้อนหลัง
        </div>
      ) : null}
      <div className="flex flex-col gap-2.5">
        {filteredLeaves.map((lv) => {
          const lt = LEAVE_TYPES.find((t) => t.id === lv.type);
          const employeeInfo = employeeDirectory.find(
            (e) => e.id === lv.employeeId,
          );
          return (
            <div
              key={lv.id}
              className="bg-white rounded-2xl p-4 shadow-[0_2px_10px_rgba(90,30,10,0.06)] border border-bdr flex items-start gap-3 animate-[fadeIn_0.2s_ease-out]"
            >
              <AvatarCircle
                avatar={
                  employeeInfo?.avatar ||
                  (employeeInfo?.name || lv.employeeName)?.slice(0, 2)
                }
                avatarType={employeeInfo?.avatarType || "text"}
                avatarImageUrl={employeeInfo?.avatarImageUrl || null}
                size={42}
                fontSize={13}
                border={`2px solid ${COLORS.gold}40`}
              />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-txt text-base mb-[3px] flex items-center gap-1.5 flex-wrap">
                  {employeeInfo?.nickname ||
                    lv.employeeNickname ||
                    employeeInfo?.name ||
                    lv.employeeName}
                  {isFuture(lv.start) && (
                    <span className="text-xs font-bold px-1.5 py-1 rounded-[10px] bg-gold-pale text-maroon border border-[#C9973A40] inline-flex items-center gap-0.5">
                      <IconFastForward size={10} strokeWidth={2.4} />
                      อนาคต
                    </span>
                  )}
                  {lv.createdByAdmin && (
                    <span className="text-xs font-extrabold tracking-wide px-1.5 py-1 rounded-[10px] bg-maroon text-white border border-maroon inline-flex items-center gap-0.5">
                      <IconShieldCheck size={10} strokeWidth={2.6} />
                      ADMIN
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mb-1">
                  <span
                    className="text-sm font-semibold inline-flex items-center gap-1"
                    style={{ color: lt?.color }}
                  >
                    {lv.type === "personal" ? (
                      <IconBriefcase size={13} strokeWidth={2.4} />
                    ) : (
                      <IconCross size={13} strokeWidth={2.4} />
                    )}
                    {lt?.label}
                  </span>
                  <span className="text-sm text-txt-soft">
                    · {lv.days} วันทำการ
                  </span>
                </div>
                <div className="text-sm text-txt-mid">
                  {fmtDateWithWeekday(lv.start)}
                  {lv.start !== lv.end
                    ? ` - ${fmtDateWithWeekday(lv.end)}`
                    : ""}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConfirmLeave(lv)}
                className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 border-[1.5px] bg-red-lt border-[#C0392B30] cursor-pointer active:scale-[0.92] transition-transform duration-100"
              >
                <IconTrash size={16} color={COLORS.red} strokeWidth={2.2} />
              </button>
            </div>
          );
        })}
      </div>
      <ConfirmModal
        leave={confirmLeave}
        onConfirm={() => {
          onDelete(confirmLeave.id);
          setConfirmLeave(null);
        }}
        onCancel={() => setConfirmLeave(null)}
      />
    </div>
  );
}
