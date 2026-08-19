/* ─── Admin: Employee edit modal (one employee) ──────────────────
   ระบบการลาเก็บข้อมูลพนักงานเท่าที่การลาต้องใช้:
   คำนำหน้า + ชื่อ · ชื่อเล่น (โชว์ในปฏิทิน/รายการลา/สรุปเช้า LINE) ·
   ตำแหน่ง (ข้อความอิสระ) · วันที่เริ่มงาน · LINE User ID (read-only)

   draft เก็บใน `editingRole` map ที่ parent (AdminPanel) ถือไว้ —
   key = `${employeeId}:${field}` · รอดเมื่อสลับ section แล้วกลับมา       */

import {
  Briefcase as IconBriefcase,
  CalendarDays as IconCalendar,
  Check as IconCheck,
  Copy as IconCopy,
  Lightbulb as IconLightbulb,
  MessageCircle as IconMessageCircle,
  Pencil as IconPencil,
  Trash2 as IconTrash,
  User as IconUser,
  X as IconX,
} from "lucide-react";
import { COLORS, THAI_MONTH_NAMES } from "../../constants";
import type { Employee } from "../../types";
import { formatTenure } from "../../utils/dateUtils";
import AvatarCircle from "../shared/AvatarCircle";
import BaseModal from "../shared/BaseModal";
import ThemedSelect from "../shared/ThemedSelect";
import { clearEmployeeDraft, EMPLOYEE_EDIT_FIELDS } from "./employeeEditFields";

type EditingRole = Record<string, any>;

interface EmployeeEditModalProps {
  employee: Employee;
  editingRole: EditingRole;
  setEditingRole: React.Dispatch<React.SetStateAction<EditingRole>>;
  onUpdateRole: (employeeId: string, field: string, value: unknown) => void;
  copiedLineId: string | null;
  copyLineId: (text: string | undefined, employeeId: string) => void;
  onClose: () => void;
  onRequestDelete: () => void;
}

export default function EmployeeEditModal({
  employee,
  editingRole,
  setEditingRole,
  onUpdateRole,
  copiedLineId,
  copyLineId,
  onClose,
  onRequestDelete,
}: EmployeeEditModalProps) {
  const draftOf = (field: string) => editingRole[`${employee.id}:${field}`];
  const setDraft = (field: string, value: unknown) =>
    setEditingRole((previous) => ({
      ...previous,
      [`${employee.id}:${field}`]: value,
    }));

  const editingPrefix = draftOf("prefix");
  const editingName = draftOf("name");
  const editingNickname = draftOf("nickname");
  const editingRoleText = draftOf("role");
  const editingStartWorkMonth = draftOf("startWorkMonth");

  const hasDraft = EMPLOYEE_EDIT_FIELDS.some(
    (f) => editingRole[`${employee.id}:${f}`] !== undefined,
  );

  const currentStartWorkMonth =
    editingStartWorkMonth !== undefined
      ? editingStartWorkMonth
      : employee.startWorkMonth || "";
  const startWorkTenure = currentStartWorkMonth
    ? formatTenure(currentStartWorkMonth)
    : "";

  const clearDraft = () =>
    setEditingRole((previous) => clearEmployeeDraft(previous, employee.id));

  // ปิด modal = ทิ้ง draft เสมอ (X header · backdrop · ESC · "ยกเลิก")
  const closeModal = () => {
    clearDraft();
    onClose();
  };

  const saveAll = () => {
    for (const field of EMPLOYEE_EDIT_FIELDS) {
      const value = editingRole[`${employee.id}:${field}`];
      if (value !== undefined) onUpdateRole(employee.id, field, value);
    }
    closeModal();
  };

  const inputCls = (dirty: boolean) =>
    `w-full py-[9px] px-3 rounded-[9px] text-sm leading-normal font-bold outline-none font-[inherit] text-txt border-[1.5px] ${
      dirty ? "border-gold bg-white" : "border-bdr bg-cream"
    }`;

  return (
    <BaseModal onClose={closeModal} maxWidthClass="max-w-[560px]">
      <div className="sticky top-0 z-10 bg-cream px-5 py-4 border-b border-bdr flex items-center gap-3">
        <AvatarCircle
          avatar={employee.avatar}
          avatarType={employee.avatarType}
          avatarImageUrl={employee.avatarImageUrl}
          size={46}
          fontSize={15}
          border={`2px solid ${COLORS.gold}40`}
        />
        <div className="flex-1 min-w-0">
          <div className="font-extrabold text-lg text-txt truncate">
            {employee.name}
          </div>
          <div className="text-sm text-txt-soft mt-0.5 truncate inline-flex items-center gap-1.5">
            <IconBriefcase size={13} strokeWidth={2.4} />
            {employee.role || "ยังไม่กำหนดตำแหน่ง"}
          </div>
        </div>
        <button
          type="button"
          aria-label="ปิดหน้าต่างแก้ไขพนักงาน"
          onClick={closeModal}
          className="w-9 h-9 rounded-[10px] border border-bdr bg-white text-txt-mid cursor-pointer flex items-center justify-center"
        >
          <IconX size={18} strokeWidth={2.3} />
        </button>
      </div>

      <div className="px-4 py-3.5">
        {/* ชื่อ + คำนำหน้า */}
        <div className="mb-2.5 p-3 rounded-[10px] bg-[#F5E6C860] border border-[#C9973A30]">
          <label className="text-xs text-maroon font-bold mb-1.5 flex items-center gap-1.5 flex-wrap">
            <IconPencil size={12} strokeWidth={2.4} />
            ชื่อพนักงาน (คำนำหน้า + ชื่อ)
          </label>
          <div className="flex gap-2">
            <div className="shrink-0 w-[110px]">
              <ThemedSelect
                value={
                  editingPrefix !== undefined
                    ? editingPrefix
                    : employee.prefix || "นางสาว"
                }
                onChange={(v) => setDraft("prefix", v)}
                options={[
                  { value: "นางสาว", label: "นางสาว" },
                  { value: "นาง", label: "นาง" },
                  { value: "นาย", label: "นาย" },
                ]}
                className={`w-full flex items-center py-[9px] pl-2.5 pr-7 rounded-[9px] text-sm leading-normal font-bold font-[inherit] text-txt border-[1.5px] cursor-pointer text-left ${
                  editingPrefix !== undefined
                    ? "border-gold bg-white"
                    : "border-bdr bg-cream"
                }`}
              />
            </div>
            <input
              type="text"
              value={editingName !== undefined ? editingName : employee.name}
              onChange={(e) => setDraft("name", e.target.value)}
              className={`flex-1 min-w-0 ${inputCls(editingName !== undefined)}`}
            />
          </div>

          {/* ชื่อเล่น */}
          <div className="mt-2.5">
            <label className="text-xs text-maroon font-bold mb-1.5 flex items-center gap-1.5">
              ชื่อเล่น
              <span className="font-normal text-txt-soft">
                (ใช้แสดงในปฏิทินการลา + สรุปเช้า LINE)
              </span>
            </label>
            <input
              type="text"
              value={
                editingNickname !== undefined
                  ? editingNickname
                  : employee.nickname || ""
              }
              onChange={(e) => setDraft("nickname", e.target.value)}
              placeholder="เช่น พี่หมู, น้องนุ่น"
              className={inputCls(editingNickname !== undefined)}
            />
          </div>
        </div>

        {/* ตำแหน่ง — ข้อความอิสระ */}
        <div className="mb-2.5 p-3 rounded-[10px] bg-[#F5E6C860] border border-[#C9973A30]">
          <label className="text-xs text-maroon font-bold mb-1.5 flex items-center gap-1.5">
            <IconUser size={12} strokeWidth={2.4} />
            ตำแหน่ง
          </label>
          <input
            type="text"
            value={
              editingRoleText !== undefined
                ? editingRoleText
                : employee.role === "-"
                  ? ""
                  : employee.role || ""
            }
            onChange={(e) => setDraft("role", e.target.value)}
            placeholder="เช่น พนักงานขาย, ช่างทอง"
            className={inputCls(editingRoleText !== undefined)}
          />
        </div>

        {/* LINE User ID — read-only, copy only */}
        <div className="mb-2.5">
          <label className="text-xs text-txt-soft font-semibold mb-1 flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1">
              <IconMessageCircle size={12} strokeWidth={2.4} />
              LINE User ID
              {employee.lineUserId ? (
                <span className="text-xs px-1.5 py-1 rounded-lg bg-[#06C75520] text-[#06A04E] font-bold">
                  เชื่อมแล้ว
                </span>
              ) : (
                <span className="text-xs px-1.5 py-1 rounded-lg bg-bdr text-txt-soft font-bold">
                  ยังไม่เชื่อม
                </span>
              )}
            </span>
          </label>
          {employee.lineUserId ? (
            <button
              type="button"
              onClick={() => copyLineId(employee.lineUserId, employee.id)}
              className={`w-full px-3 py-[9px] rounded-[9px] bg-cream cursor-pointer font-[inherit] flex items-center gap-2 transition-all duration-200 border ${
                copiedLineId === employee.id ? "border-green" : "border-bdr"
              }`}
            >
              <span className="flex-1 text-left text-sm text-txt font-[Prompt,monospace] tracking-[0.02em] overflow-hidden text-ellipsis whitespace-nowrap min-w-0">
                {employee.lineUserId}
              </span>
              <span
                className={`flex items-center gap-1 px-[9px] py-1 rounded-[7px] text-xs font-bold whitespace-nowrap transition-all duration-200 ${
                  copiedLineId === employee.id
                    ? "bg-green-lt text-green"
                    : "bg-gold-pale text-maroon"
                }`}
              >
                {copiedLineId === employee.id ? (
                  <>
                    <IconCheck size={12} strokeWidth={3} />
                    คัดลอกแล้ว
                  </>
                ) : (
                  <>
                    <IconCopy size={12} strokeWidth={2.2} />
                    คัดลอก
                  </>
                )}
              </span>
            </button>
          ) : (
            <div className="px-3 py-2.5 rounded-[9px] border border-dashed border-bdr bg-cream text-sm text-txt-soft italic text-center">
              — ยังไม่ได้เชื่อมต่อ LINE —
            </div>
          )}
          <div className="text-xs text-txt-soft mt-[3px] leading-normal">
            <IconLightbulb
              size={12}
              strokeWidth={2.4}
              className="inline mr-1"
            />
            ID จะถูกเก็บอัตโนมัติเมื่อพนักงานเข้าสู่ระบบผ่าน LINE
          </div>
        </div>

        {/* วันที่เริ่มงาน */}
        <div className="mb-1 p-3 rounded-[10px] bg-[#F5E6C860] border border-[#C9973A30]">
          <label className="text-xs text-maroon font-bold mb-1.5 flex items-center gap-1.5 flex-wrap">
            <IconCalendar size={12} strokeWidth={2.4} />
            วันที่เริ่มงาน
            {startWorkTenure && (
              <span className="font-normal text-txt-soft">
                ({startWorkTenure})
              </span>
            )}
          </label>
          {(() => {
            const [curYear, curMonth] = currentStartWorkMonth.includes("-")
              ? currentStartWorkMonth.split("-")
              : ["", ""];
            const nowYear = new Date().getFullYear();
            const years = Array.from({ length: 40 }, (_, i) => nowYear - i);
            const setYM = (y: string, m: string) =>
              setDraft("startWorkMonth", y && m ? `${y}-${m}` : "");
            const dirtyCls =
              editingStartWorkMonth !== undefined
                ? "border-gold bg-white"
                : "border-bdr bg-cream";
            const selectCls = `w-full flex items-center py-[9px] pl-3 pr-7 rounded-[9px] text-sm leading-normal font-bold font-[inherit] text-txt border-[1.5px] cursor-pointer text-left ${dirtyCls}`;
            return (
              <div className="flex gap-2">
                <div className="flex-1">
                  <ThemedSelect
                    value={curMonth}
                    placeholder="เดือน"
                    onChange={(v) => setYM(curYear || String(nowYear), v)}
                    options={THAI_MONTH_NAMES.map((mn, i) => ({
                      value: String(i + 1).padStart(2, "0"),
                      label: mn,
                    }))}
                    className={selectCls}
                  />
                </div>
                <div className="flex-1">
                  <ThemedSelect
                    value={curYear}
                    placeholder="ปี (พ.ศ.)"
                    onChange={(v) => setYM(v, curMonth || "01")}
                    options={years.map((y) => ({
                      value: String(y),
                      label: String(y + 543),
                    }))}
                    className={selectCls}
                  />
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Footer */}
      <div className="sticky bottom-0 bg-cream px-4 py-3 border-t border-bdr">
        {hasDraft ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={closeModal}
              className="basis-[34%] shrink-0 py-3.5 rounded-2xl border-[1.5px] border-bdr bg-white text-txt-mid text-base font-semibold cursor-pointer font-[inherit] active:scale-[0.98] transition-transform duration-100"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={saveAll}
              className="flex-1 py-3.5 rounded-2xl border-none bg-maroon text-white text-base font-bold cursor-pointer font-[inherit] flex items-center justify-center gap-2 shadow-maroon-glow"
            >
              <IconCheck size={16} strokeWidth={2.5} />
              บันทึก
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onRequestDelete}
              className="py-[11px] px-4 rounded-[10px] border-[1.5px] border-red/40 bg-white text-red text-sm font-semibold cursor-pointer font-[inherit] flex items-center justify-center gap-1.5"
            >
              <IconTrash size={15} strokeWidth={2.2} />
              ลบ
            </button>
            <button
              type="button"
              onClick={closeModal}
              className="flex-1 py-[11px] rounded-[10px] border-[1.5px] border-bdr bg-white text-txt-mid text-sm font-semibold cursor-pointer font-[inherit] active:scale-[0.98] transition-transform duration-100"
            >
              ปิด
            </button>
          </div>
        )}
      </div>
    </BaseModal>
  );
}
