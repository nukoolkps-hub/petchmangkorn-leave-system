/* ─── DutyEditModal — ฟอร์มเพิ่ม/แก้หน้าที่ (admin) ─────────────────
   2 ประเภท (kind):
   • rotation — หมุนเวียนคนที่เลือกไว้ตามรอบ (สัปดาห์/เดือน)
   • coverage — แทนคนลาของคนกลุ่มเป้าหมาย (เลือกรายชื่อคนแทน)

   ระบบนี้ไม่มี "ตำแหน่ง" แบบระบบเพชรทองมุกดา (`Employee.role` เป็นข้อความ
   อิสระ) → admin เลือกคนรายชื่อเอง · ฟิลด์ของแต่ละ kind อยู่ใน
   DutyEditFields.tsx                                                   */

import { CalendarClock as IconCalendarClock, X as IconX } from "lucide-react";
import { useState } from "react";
import type { Duty, Employee } from "../../types";
import { toYMD } from "../../utils/dateUtils";
import { sortByDisplayOrder } from "../../utils/dutyUtils";
import BaseModal from "../shared/BaseModal";
import Spinner from "../shared/Spinner";
import { CoverageFields, RotationFields } from "./DutyEditFields";

interface DutyEditModalProps {
  duty: Duty | null;
  employeeDirectory: Employee[];
  onSave: (data: Omit<Duty, "id" | "createdAt" | "updatedAt">) => Promise<void>;
  onClose: () => void;
}

/** toggle id ใน Set แบบ immutable — ใช้กับทุกกลุ่มชิปในฟอร์ม */
function toggled(prev: Set<string>, id: string): Set<string> {
  const next = new Set(prev);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export default function DutyEditModal({
  duty,
  employeeDirectory,
  onSave,
  onClose,
}: DutyEditModalProps) {
  const [name, setName] = useState(duty?.name || "");
  const [kind, setKind] = useState<"rotation" | "coverage">(
    duty?.kind || "rotation",
  );
  const [period, setPeriod] = useState<"weekly" | "monthly">(
    duty?.period || "weekly",
  );
  // rotation anchor — เก็บเป็นเดือน (YYYY-MM) · save จริงเป็น YYYY-MM-01
  const [startMonth, setStartMonth] = useState(
    (duty?.rotationStartDate || toYMD(new Date())).slice(0, 7),
  );
  // คนที่หมุนทำหน้าที่นี้ (rotation pool)
  const [memberIds, setMemberIds] = useState<Set<string>>(
    () => new Set(duty?.memberEmpIds || []),
  );
  // "คนเริ่ม" รอบแรก — anchor ของ round-robin · "" = อัตโนมัติ (hashDutyId)
  const [rotationStartEmpId, setRotationStartEmpId] = useState<string>(
    duty?.rotationStartEmpId || "",
  );
  // คนที่ "ไม่ให้เป็นคนแทน" — ยังหมุนเป็นเวรหลักได้ แต่ไม่ถูกเลือกมาแทนคนลา
  const [noSubstituteIds, setNoSubstituteIds] = useState<Set<string>>(
    () => new Set(duty?.substituteExcludedEmpIds || []),
  );
  // (weekly) ข้ามวันอาทิตย์ · default = false (ทำทุกวัน)
  const [skipSundays, setSkipSundays] = useState<boolean>(
    duty?.skipSundays ?? false,
  );
  // "ผูกขาดคนทำ" — คนที่ทำหน้าที่นี้วันนั้นจะไม่ถูกจัดหน้าที่อื่นเลย
  const [exclusive, setExclusive] = useState<boolean>(duty?.exclusive ?? false);
  // coverage — คนที่ถ้าลาต้องหาคนแทน + รายชื่อคนแทน
  const [targetIds, setTargetIds] = useState<Set<string>>(
    () => new Set(duty?.coverageTargetEmpIds || []),
  );
  const [candidateIds, setCandidateIds] = useState<Set<string>>(
    () => new Set(duty?.candidateEmpIds || []),
  );
  const [saving, setSaving] = useState(false);

  const allEmployees = sortByDisplayOrder(employeeDirectory);
  const existingIds = new Set(allEmployees.map((e) => e.id));
  // เก็บเฉพาะ id ที่ยังมีตัวตน — พนักงานที่ถูกลบไปแล้วไม่ค้างใน doc
  const keep = (ids: Set<string>) =>
    [...ids].filter((id) => existingIds.has(id));

  // ลำดับการสลับจริง = คนที่เลือก เรียงตาม displayOrder (ตรงกับ resolveDutyPool)
  const includedPool = allEmployees.filter((e) => memberIds.has(e.id));
  // คนเริ่มต้องอยู่ใน pool ปัจจุบัน — ถูกเอาออกแล้ว → กลับเป็นอัตโนมัติ
  // (กัน anchor ชี้คนที่ไม่อยู่ใน pool แล้วปฏิทินหน้าที่เพี้ยน)
  const effectiveStartEmpId = includedPool.some(
    (e) => e.id === rotationStartEmpId,
  )
    ? rotationStartEmpId
    : "";

  const canSave =
    kind === "coverage"
      ? !!name.trim() &&
        keep(targetIds).length > 0 &&
        keep(candidateIds).length > 0
      : !!name.trim() && includedPool.length > 0;

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(
        kind === "coverage"
          ? {
              name: name.trim(),
              kind: "coverage",
              period: "weekly",
              coverageTargetEmpIds: keep(targetIds),
              candidateEmpIds: keep(candidateIds),
              rotationStartDate: `${startMonth}-01`,
            }
          : {
              name: name.trim(),
              kind: "rotation",
              period,
              memberEmpIds: keep(memberIds),
              // "ไม่ให้เป็นคนแทน" — เฉพาะคนที่ยังอยู่ใน pool · กัน id ค้าง
              substituteExcludedEmpIds: keep(noSubstituteIds).filter((id) =>
                memberIds.has(id),
              ),
              // weekly เท่านั้น · monthly บังคับ false
              skipSundays: period === "weekly" ? skipSundays : false,
              exclusive,
              rotationStartDate: `${startMonth}-01`,
              rotationStartEmpId: effectiveStartEmpId,
              // anchor (คนเริ่ม / เดือนเริ่ม) เปลี่ยน → ล้าง cache primary ของ
              // period ปัจจุบัน ให้ค่าใหม่มีผลทันที (ไม่งั้น cachedPrimary เดิม
              // จะ override การคำนวณใหม่)
              ...((duty?.rotationStartEmpId || "") !== effectiveStartEmpId ||
              (duty?.rotationStartDate || "").slice(0, 7) !== startMonth
                ? { cachedPrimary: null }
                : {}),
            },
      );
    } catch {
      // parent (DutySchedulePanel) แสดง toast + คง modal ไว้แล้ว
    } finally {
      setSaving(false);
    }
  }

  return (
    <BaseModal onClose={onClose} maxWidthClass="max-w-[480px]">
      <div className="sticky top-0 z-10 bg-cream px-5 py-4 border-b border-bdr flex items-center gap-3">
        <div className="w-10 h-10 rounded-[11px] bg-gold-pale flex items-center justify-center shrink-0">
          <IconCalendarClock
            size={20}
            strokeWidth={2.4}
            className="text-maroon"
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-extrabold text-lg text-txt">
            {duty ? "แก้ไขหน้าที่" : "เพิ่มหน้าที่ใหม่"}
          </div>
        </div>
        <button
          type="button"
          aria-label="ปิด"
          onClick={onClose}
          className="w-9 h-9 rounded-[10px] border border-bdr bg-white text-txt-mid cursor-pointer flex items-center justify-center"
        >
          <IconX size={18} strokeWidth={2.3} />
        </button>
      </div>

      <div className="px-4 py-3.5">
        {/* name */}
        <div className="mb-3 p-3 rounded-[10px] bg-[#F5E6C860] border border-[#C9973A30]">
          <label className="text-xs text-maroon font-bold mb-1.5 block">
            ชื่อหน้าที่
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="เช่น ทำความสะอาด, แทนบัญชี"
            className="w-full py-[9px] px-3 rounded-[9px] text-sm leading-normal font-bold outline-none font-[inherit] text-txt border-[1.5px] border-bdr bg-white"
          />
        </div>

        {/* kind — หมุนเวียน / แทนคนลา */}
        <div className="mb-3 p-3 rounded-[10px] bg-[#F5E6C860] border border-[#C9973A30]">
          <label className="text-xs text-maroon font-bold mb-1.5 block">
            ประเภทหน้าที่
          </label>
          <div className="flex gap-2">
            {(
              [
                ["rotation", "หมุนเวียน"],
                ["coverage", "แทนคนลา"],
              ] as const
            ).map(([k, lbl]) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`flex-1 py-2 rounded-[9px] text-sm font-semibold cursor-pointer font-[inherit] border-[1.5px] active:scale-[0.98] transition-transform duration-100 ${
                  kind === k
                    ? "bg-maroon text-white border-maroon"
                    : "bg-white text-txt-mid border-bdr"
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
          <div className="text-xs text-txt-soft mt-1.5">
            {kind === "rotation"
              ? "หมุนเวียนคนที่เลือกไว้ตามรอบ (สัปดาห์/เดือน) · คนที่ถึงเวรลา ระบบหาคนแทนให้"
              : "เมื่อคนที่เลือกไว้ลา → ระบบเลือกคนแทนให้ยุติธรรม (เคยแทนน้อยสุดก่อน)"}
          </div>
        </div>

        <div key={kind} className="animate-[fadeIn_0.2s_ease-out]">
          {kind === "coverage" ? (
            <CoverageFields
              employees={allEmployees}
              targetIds={targetIds}
              toggleTarget={(id) => setTargetIds((p) => toggled(p, id))}
              candidateIds={candidateIds}
              toggleCandidate={(id) => setCandidateIds((p) => toggled(p, id))}
            />
          ) : (
            <RotationFields
              employees={allEmployees}
              period={period}
              setPeriod={setPeriod}
              startMonth={startMonth}
              setStartMonth={setStartMonth}
              memberIds={memberIds}
              toggleMember={(id) => setMemberIds((p) => toggled(p, id))}
              setMembers={(ids) => setMemberIds(new Set(ids))}
              includedPool={includedPool}
              noSubstituteIds={noSubstituteIds}
              toggleNoSubstitute={(id) =>
                setNoSubstituteIds((p) => toggled(p, id))
              }
              rotationStartEmpId={effectiveStartEmpId}
              setRotationStartEmpId={setRotationStartEmpId}
              skipSundays={skipSundays}
              setSkipSundays={setSkipSundays}
              exclusive={exclusive}
              setExclusive={setExclusive}
            />
          )}
        </div>
      </div>

      {/* footer */}
      <div className="sticky bottom-0 z-10 bg-white px-4 py-3 border-t border-bdr">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="basis-[34%] shrink-0 py-3.5 rounded-2xl border-[1.5px] border-bdr bg-white text-txt-mid text-base font-semibold cursor-pointer font-[inherit] active:scale-[0.98] transition-transform"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            disabled={!canSave || saving}
            onClick={handleSave}
            className={`flex-1 py-3.5 rounded-2xl border-none text-white text-base font-bold cursor-pointer font-[inherit] active:scale-[0.98] transition-transform inline-flex items-center justify-center gap-2 ${
              canSave && !saving
                ? "bg-maroon shadow-maroon-glow"
                : "bg-bdr cursor-not-allowed"
            }`}
          >
            {saving && <Spinner size={16} />}
            {saving ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </div>
      </div>
    </BaseModal>
  );
}
