/* ─── ฟิลด์ของ DutyEditModal (แยกไฟล์ให้ modal ไม่โตเกิน) ───────────
   • RotationFields — รอบสลับ · ตัวเลือกวัน · เลือกคน · ไม่ให้แทน · คนเริ่ม
   • CoverageFields — คนที่ถ้าลาต้องหาคนแทน · รายชื่อคนแทน
   ทุกกลุ่มเลือกด้วยชิปชื่อพนักงาน (EmployeeChips) แบบเดียวกัน            */

import {
  AlertTriangle as IconAlertTriangle,
  Lock as IconLock,
} from "lucide-react";
import type { ReactNode } from "react";
import type { Employee } from "../../types";
import { formatYmThai } from "../../utils/dateUtils";
import AvatarCircle from "../shared/AvatarCircle";
import ThaiMonthPicker from "../shared/ThaiMonthPicker";
import ToggleSwitch from "../shared/ToggleSwitch";

const BOX_GOLD =
  "mb-3 p-3 rounded-[10px] bg-[#F5E6C860] border border-[#C9973A30]";
const BOX_CREAM = "mb-3 p-3 rounded-[10px] bg-cream border border-bdr";

/** ชิปชื่อพนักงาน 1 ตัว — tone: on = เลือกแล้ว (maroon) · warn = amber */
function EmployeeChip({
  emp,
  tone,
  onClick,
  suffix,
}: {
  emp: Employee;
  tone: "on" | "off" | "warn";
  onClick: () => void;
  suffix?: ReactNode;
}) {
  const toneClass =
    tone === "on"
      ? "bg-maroon text-white border-maroon"
      : tone === "warn"
        ? "bg-amber-lt text-amber border-amber/40"
        : "bg-white text-txt-mid border-bdr hover:border-maroon";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold cursor-pointer font-[inherit] border transition-all active:scale-[0.96] ${toneClass}`}
    >
      <AvatarCircle
        avatar={emp.avatar}
        avatarType={emp.avatarType}
        avatarImageUrl={emp.avatarImageUrl}
        size={18}
        fontSize={9}
        border="none"
      />
      {emp.nickname || emp.name}
      {suffix}
    </button>
  );
}

/** กลุ่มชิปเลือกหลายคน — selected = maroon */
function EmployeeChips({
  employees,
  selected,
  onToggle,
}: {
  employees: Employee[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  if (employees.length === 0) {
    return (
      <div className="text-xs text-txt-soft italic">
        ยังไม่มีพนักงาน — เพิ่มที่ "ตั้งค่า → พนักงาน" ก่อน
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {employees.map((emp) => (
        <EmployeeChip
          key={emp.id}
          emp={emp}
          tone={selected.has(emp.id) ? "on" : "off"}
          onClick={() => onToggle(emp.id)}
        />
      ))}
    </div>
  );
}

/** สวิตช์เปิด-ปิดทั้งกรอบ (กดได้ทั้งกล่อง) */
function ToggleRow({
  enabled,
  onToggle,
  title,
  children,
}: {
  enabled: boolean;
  onToggle: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full text-left ${BOX_GOLD} cursor-pointer font-[inherit] flex items-center gap-2.5 transition-all duration-150 active:scale-[0.99]`}
    >
      <ToggleSwitch enabled={enabled} />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-bold text-txt">{title}</span>
        <span className="block text-xs text-txt-soft mt-0.5">{children}</span>
      </span>
    </button>
  );
}

/* ─── coverage (แทนคนลา) ───────────────────────────────────────────── */
export function CoverageFields({
  employees,
  targetIds,
  toggleTarget,
  candidateIds,
  toggleCandidate,
}: {
  employees: Employee[];
  targetIds: Set<string>;
  toggleTarget: (id: string) => void;
  candidateIds: Set<string>;
  toggleCandidate: (id: string) => void;
}) {
  return (
    <>
      <div className={BOX_GOLD}>
        <label className="text-xs text-maroon font-bold mb-1 block">
          คนที่ถ้าลา ต้องหาคนแทน ({targetIds.size} คน)
        </label>
        <div className="text-xs text-txt-soft mb-2">
          เช่น พนักงานบัญชี — วันที่คนนี้ลา ระบบจะเลือกคนมาแทนให้
        </div>
        <EmployeeChips
          employees={employees}
          selected={targetIds}
          onToggle={toggleTarget}
        />
      </div>

      <div className={BOX_GOLD}>
        <label className="text-xs text-maroon font-bold mb-1 block">
          รายชื่อคนที่มาแทนได้ ({candidateIds.size} คน)
        </label>
        <div className="text-xs text-txt-soft mb-2">
          ระบบจะเลือกคน "ที่เคยแทนน้อยสุด" ก่อน ให้ยุติธรรม · คนที่ทำหน้าที่ประจำเดือน
          อยู่จะไม่ถูกเลือกมาแทน
        </div>
        <EmployeeChips
          employees={employees}
          selected={candidateIds}
          onToggle={toggleCandidate}
        />
      </div>

      {/* coverage ผูกขาดโดยธรรมชาติ (ไม่มี toggle · ปิดไม่ได้) — คนที่ถูกดึงมา
          แทนถูกกันออกจากหน้าที่หมุนเวียนทุกชั้นในวันนั้น */}
      <div className={`${BOX_GOLD} flex items-start gap-2.5`}>
        <span className="w-8 h-8 rounded-[9px] bg-maroon flex items-center justify-center shrink-0">
          <IconLock size={15} strokeWidth={2.6} className="text-white" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-txt">
            ผูกขาดคนทำ — เปิดอยู่เสมอ
          </span>
          <span className="block text-xs text-txt-soft mt-0.5">
            คนที่ถูกดึงมาแทนในวันนั้นจะไม่ถูกจัดหน้าที่อื่นเลย · ถ้าเขาเป็นคนหลักของหน้าที่อื่นอยู่
            เวรยังเป็นของเขาเหมือนเดิม แค่วันนั้นมีคนมาทำแทน (การ์ดขึ้น "แทน X (ติดหน้าที่อื่น)")
            ลำดับเวรไม่เลื่อน · ยกเว้นวันที่คนมาทำงานน้อยกว่าจำนวนหน้าที่ ระบบจะยอมให้ทำซ้อน
            แทนที่จะปล่อยหน้าที่ว่าง
          </span>
        </span>
      </div>
    </>
  );
}

/* ─── rotation (หมุนเวียน) ─────────────────────────────────────────── */
export function RotationFields({
  employees,
  period,
  setPeriod,
  startMonth,
  setStartMonth,
  memberIds,
  toggleMember,
  setMembers,
  includedPool,
  noSubstituteIds,
  toggleNoSubstitute,
  rotationStartEmpId,
  setRotationStartEmpId,
  skipSundays,
  setSkipSundays,
  exclusive,
  setExclusive,
}: {
  employees: Employee[];
  period: "weekly" | "monthly";
  setPeriod: (p: "weekly" | "monthly") => void;
  startMonth: string;
  setStartMonth: (m: string) => void;
  memberIds: Set<string>;
  toggleMember: (id: string) => void;
  setMembers: (ids: string[]) => void;
  /** คนที่เลือก เรียงตามลำดับการสลับจริง (displayOrder) */
  includedPool: Employee[];
  noSubstituteIds: Set<string>;
  toggleNoSubstitute: (id: string) => void;
  rotationStartEmpId: string;
  setRotationStartEmpId: (id: string) => void;
  skipSundays: boolean;
  setSkipSundays: (v: boolean) => void;
  exclusive: boolean;
  setExclusive: (v: boolean) => void;
}) {
  const allSelected =
    employees.length > 0 && employees.every((e) => memberIds.has(e.id));
  return (
    <>
      {/* period */}
      <div className={BOX_GOLD}>
        <label className="text-xs text-maroon font-bold mb-1.5 block">
          สลับทุก
        </label>
        <div className="flex gap-2">
          {(["weekly", "monthly"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`flex-1 py-2 rounded-[9px] text-sm font-semibold cursor-pointer font-[inherit] border-[1.5px] active:scale-[0.98] transition-transform duration-100 ${
                period === p
                  ? "bg-maroon text-white border-maroon"
                  : "bg-white text-txt-mid border-bdr"
              }`}
            >
              {p === "weekly" ? "สัปดาห์ (7 วัน)" : "เดือน"}
            </button>
          ))}
        </div>
      </div>

      {period === "weekly" && (
        <ToggleRow
          enabled={skipSundays}
          onToggle={() => setSkipSundays(!skipSundays)}
          title="ข้ามวันอาทิตย์ (ไม่ทำหน้าที่นี้)"
        >
          วันอาทิตย์ลูกค้าเยอะ — ให้ทุกคน focus หน้าร้านแทน · หน้าที่นี้จะไม่โผล่ใน "หน้าที่วันนี้"
          ของวันอาทิตย์
        </ToggleRow>
      )}

      <ToggleRow
        enabled={exclusive}
        onToggle={() => setExclusive(!exclusive)}
        title="ผูกขาดคนทำ (ไม่ต้องทำหน้าที่อื่น)"
      >
        คนที่ทำหน้าที่นี้ในวันนั้น — ไม่ว่าจะเป็นคนหลักหรือคนแทน — จะไม่ถูกจัดหน้าที่อื่นในวันเดียวกัน ·
        ถ้าเขาเป็นคนหลักของหน้าที่อื่นอยู่ เวรยังเป็นของเขาเหมือนเดิม แค่วันนั้นมีคนมาทำแทน ·
        ยกเว้นวันที่คนมาทำงานน้อยกว่าจำนวนหน้าที่ ระบบจะยอมให้ทำซ้อนแทนที่จะปล่อยหน้าที่ว่าง
      </ToggleRow>

      {/* rotation start month — monthsBack=12 ให้ตั้ง "เดือนนี้" ได้แม้อยู่ปลายเดือน */}
      <div className={BOX_GOLD}>
        <label className="text-xs text-maroon font-bold mb-1.5 block">
          เริ่มหมุนเวียนเดือน
        </label>
        <ThaiMonthPicker
          value={startMonth}
          onChange={setStartMonth}
          monthsBack={12}
        />
        <div className="text-xs text-txt-soft mt-1">
          "คนเริ่ม" ทำหน้าที่ตั้งแต่ต้นเดือนนี้ · รอบถัดไปหมุนเวียนเป็นคนถัดไป
        </div>
      </div>

      {/* members */}
      <div className={BOX_GOLD}>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-maroon font-bold">
            คนที่ทำหน้าที่นี้ ({memberIds.size} คน)
          </label>
          {employees.length > 0 && (
            <button
              type="button"
              onClick={() =>
                setMembers(allSelected ? [] : employees.map((e) => e.id))
              }
              className="text-xs font-bold text-maroon bg-transparent border-none cursor-pointer font-[inherit] underline underline-offset-2"
            >
              {allSelected ? "ล้างทั้งหมด" : "เลือกทุกคน"}
            </button>
          )}
        </div>
        <div className="text-xs text-txt-soft mb-2">
          คลิกชื่อเพื่อเลือก/เอาออก · ลำดับการสลับเรียงตามลำดับพนักงานในหน้า "พนักงาน"
          (ลากเรียงที่นั่น)
        </div>
        <EmployeeChips
          employees={employees}
          selected={memberIds}
          onToggle={toggleMember}
        />
      </div>

      {/* preview ลำดับจริง */}
      <div className={BOX_CREAM}>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-txt-mid font-bold">
            ลำดับการสลับ · {includedPool.length} คน
          </label>
          {includedPool.length === 0 && (
            <span className="text-[11px] text-red font-bold inline-flex items-center gap-1">
              <IconAlertTriangle size={11} strokeWidth={2.4} />
              ยังไม่ได้เลือกคน
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {includedPool.map((emp, idx) => (
            <span
              key={emp.id}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-white text-txt-mid border border-bdr"
            >
              <span>{idx + 1}.</span>
              {emp.nickname || emp.name}
            </span>
          ))}
        </div>
      </div>

      {/* ไม่ให้เป็นคนแทน — ยังหมุนเป็นเวรหลักได้ แต่ไม่ถูกเลือกมาแทนคนลา */}
      {includedPool.length > 1 && (
        <div className={BOX_CREAM}>
          <label className="text-xs text-txt-mid font-bold mb-1 block">
            ไม่ให้เป็นคนแทน (ตอนคนอื่นลา)
          </label>
          <div className="text-xs text-txt-soft mb-2">
            คลิกชื่อ = คนนั้น <b>ยังหมุนเป็นเวรหลักได้ตามปกติ</b> แต่จะไม่ถูกเลือกมา
            <b>แทน</b> เมื่อคนอื่นในหน้าที่นี้ลา
          </div>
          <div className="flex flex-wrap gap-1.5">
            {includedPool.map((emp) => {
              const off = noSubstituteIds.has(emp.id);
              return (
                <EmployeeChip
                  key={emp.id}
                  emp={emp}
                  tone={off ? "warn" : "off"}
                  onClick={() => toggleNoSubstitute(emp.id)}
                  suffix={
                    off && (
                      <span className="ml-0.5 font-bold text-[9px]">ไม่แทน</span>
                    )
                  }
                />
              );
            })}
          </div>
        </div>
      )}

      {/* คนเริ่ม (รอบแรก) — anchor ของรอบ · default = อัตโนมัติ */}
      {includedPool.length > 0 && (
        <div className={BOX_GOLD}>
          <label className="text-xs text-maroon font-bold mb-1 block">
            คนเริ่ม — เดือน {formatYmThai(startMonth)}
          </label>
          <div className="text-xs text-txt-soft mb-2">
            คนที่เลือกจะทำหน้าที่นี้ในรอบแรกของ <b>{formatYmThai(startMonth)}</b>{" "}
            แล้วรอบถัดไปหมุนเวียนเป็นคนถัดไปตามลำดับ · "อัตโนมัติ" = ระบบเลือกให้เอง
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setRotationStartEmpId("")}
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold cursor-pointer font-[inherit] border transition-all active:scale-[0.96] ${
                rotationStartEmpId === ""
                  ? "bg-maroon text-white border-maroon"
                  : "bg-white text-txt-mid border-bdr hover:border-maroon"
              }`}
            >
              อัตโนมัติ
            </button>
            {includedPool.map((emp) => (
              <EmployeeChip
                key={emp.id}
                emp={emp}
                tone={rotationStartEmpId === emp.id ? "on" : "off"}
                onClick={() => setRotationStartEmpId(emp.id)}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
