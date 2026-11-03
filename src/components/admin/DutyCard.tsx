/* ─── DutyCard — การ์ด 1 หน้าที่ (admin) ───────────────────────────
   แสดง: ชื่อ + ประเภท (หมุนเวียน/แทนคนลา) + วันนี้ใครทำ + รายชื่อ pool
   ข้อมูล assignment มาจาก server snapshot (single source of truth)

   coverage 1 หน้าที่อาจมีหลาย assignment (เป้าหมายลาหลายคน) → รับเป็น
   array แล้วแสดง "วันนี้" ทุกบรรทัด                                       */

import {
  AlertTriangle as IconAlertTriangle,
  CalendarClock as IconCalendarClock,
  CalendarDays as IconCalendarDays,
  CalendarX as IconCalendarX,
  Lock as IconLock,
  RotateCw as IconRotate,
  Trash2 as IconTrash,
  Users as IconUsers,
} from "lucide-react";
import type {
  DutyPoolInfo,
  SnapshotAssignment,
  SnapshotPoolMember,
} from "../../firebase/dutyAssignments";
import type { Duty, Employee } from "../../types";
import { isSunday } from "../../utils/dutyUtils";
import AvatarCircle from "../shared/AvatarCircle";

interface DutyCardProps {
  duty: Duty;
  /** assignment ทั้งหมดของหน้าที่นี้ (rotation = 1 · coverage = 1 ต่อเป้าหมายที่ลา) */
  assignments: SnapshotAssignment[];
  empById: Map<string, SnapshotPoolMember>;
  /** ใช้แปลง coverageTargetEmpIds → ชื่อ (คนที่ถูกแทนอยู่นอก pool) */
  employeeDirectory: Employee[];
  /** pool (roster) ของหน้าที่นี้ จาก snapshot.dutyPools — มีเสมอแม้วันที่หน้าที่
   *  หยุด (อาทิตย์ที่ skipSundays / ร้านปิด) ที่ assignments ไม่มี entry ให้ */
  dutyPool?: DutyPoolInfo;
  /** วันของ snapshot (YYYY-MM-DD) — ใช้เช็ค "วันนี้เป็นอาทิตย์ที่ข้าม" ไหม */
  snapshotDate?: string;
  onEdit: () => void;
  onDelete: () => void;
}

/** 1 บรรทัด "วันนี้" — คนที่ทำจริง + เหตุผล (แทนใคร) */
function TodayRow({
  assignment,
  empById,
  isCoverage,
  coverageTargetLabel,
  offTodayLabel,
}: {
  assignment: SnapshotAssignment | undefined;
  empById: Map<string, SnapshotPoolMember>;
  isCoverage: boolean;
  coverageTargetLabel: string;
  /** ข้อความ "วันนี้หยุด" — set เมื่อหน้าที่มี pool แต่วันนี้ไม่ถูก assign
   *  (อาทิตย์ที่ข้าม / ร้านปิด) · null = แสดง fallback เดิม (empty pool) */
  offTodayLabel: string | null;
}) {
  const actual = assignment?.actualEmpId
    ? empById.get(assignment.actualEmpId)
    : null;
  const primary = assignment?.primaryEmpId
    ? empById.get(assignment.primaryEmpId)
    : null;
  const isSubstitute =
    assignment?.reason === "substitute_for_leave" ||
    assignment?.reason === "double_up";

  if (actual) {
    return (
      <div className="flex items-center gap-2">
        <AvatarCircle
          avatar={actual.avatar}
          avatarType={actual.avatarType}
          avatarImageUrl={actual.avatarImageUrl}
          size={32}
          fontSize={12}
          border="none"
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-maroon truncate">
            {actual.nickname || actual.name}
          </div>
          {isCoverage ? (
            <div className="text-[11px] text-txt-soft">
              แทน {assignment?.targetName || "—"} (ลา)
            </div>
          ) : (
            isSubstitute &&
            primary && (
              <div className="text-[11px] text-txt-soft">
                แทน {primary.nickname || primary.name} (
                {assignment?.primaryPulledToDuty ? "ติดหน้าที่อื่น" : "ลา"})
              </div>
            )
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`text-sm italic ${
        isCoverage && assignment?.reason === "empty_target_role"
          ? "text-red font-semibold not-italic"
          : "text-txt-soft"
      }`}
    >
      {isCoverage ? (
        assignment?.reason === "coverage_no_candidate" ? (
          `${assignment?.targetName || "เป้าหมาย"} ลา — ไม่มีคนแทนได้`
        ) : assignment?.reason === "empty_target_role" ? (
          <span className="inline-flex items-center gap-1.5 align-middle">
            <IconAlertTriangle
              size={14}
              strokeWidth={2.4}
              className="shrink-0"
            />
            ยังไม่ได้เลือกคนที่ต้องหาคนแทน — กดแก้ไขเพื่อตั้งค่า
          </span>
        ) : (
          `${coverageTargetLabel} ไม่ลาวันนี้ — ไม่ต้องมีคนแทน`
        )
      ) : assignment?.reason === "all_on_leave" ? (
        "ทุกคนในกลุ่มลาวันนี้"
      ) : (
        // ไม่มี assignment วันนี้ แต่มีคนใน pool → หน้าที่หยุดวันนี้
        // (อาทิตย์ที่ข้าม / ร้านปิด) · ไม่มีคนใน pool จริง → ยังไม่ได้ตั้ง
        (offTodayLabel ?? "ยังไม่ได้ตั้ง pool")
      )}
    </div>
  );
}

export default function DutyCard({
  duty,
  assignments,
  empById,
  employeeDirectory,
  dutyPool,
  snapshotDate,
  onEdit,
  onDelete,
}: DutyCardProps) {
  const isCoverage = duty.kind === "coverage";
  // ชื่อคนที่ "ถ้าลาต้องหาคนแทน" — คนที่ถูกลบจากระบบไปแล้วข้ามเอง
  const coverageTargetNames = (duty.coverageTargetEmpIds || [])
    .map((id) => employeeDirectory.find((e) => e.id === id))
    .filter((e): e is Employee => !!e)
    .map((e) => e.nickname || e.name);
  const coverageTargetLabel = coverageTargetNames.join(", ") || "เป้าหมาย";
  // pool จาก dutyPools (roster · มีเสมอ) · fallback assignment แรก
  // (snapshot เก่า) · primary highlight อ้างจาก assignment วันนี้
  const head = assignments[0];
  const resolvedPool = dutyPool?.pool ?? head?.pool ?? [];
  // หน้าที่หยุดวันนี้ = มีคนใน pool แต่ไม่มี assignment วันนี้ (อาทิตย์ที่ข้าม /
  // ร้านปิด) → บอก "วันนี้หยุด" แทน "ยังไม่ได้ตั้ง pool" ที่ชวนเข้าใจผิด
  const offTodayLabel =
    !isCoverage && assignments.length === 0 && resolvedPool.length > 0
      ? duty.period === "weekly" &&
        duty.skipSundays &&
        snapshotDate &&
        isSunday(snapshotDate)
        ? "วันนี้หยุด · ข้ามวันอาทิตย์"
        : "วันนี้หยุด"
      : null;

  return (
    <div className="bg-white rounded-[14px] p-3.5 border border-bdr shadow-[0_2px_10px_rgba(90,30,10,0.05)]">
      <div className="flex items-center gap-2 mb-2.5">
        <IconCalendarClock
          size={18}
          strokeWidth={2.4}
          className="text-maroon shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="font-bold text-txt text-sm truncate">{duty.name}</div>
          <div className="text-xs text-txt-soft inline-flex items-center gap-1 mt-0.5 flex-wrap">
            <IconRotate size={11} strokeWidth={2.4} />
            {isCoverage
              ? `แทนคนลา · ${coverageTargetNames.join(", ") || "(ยังไม่เลือก)"}`
              : `สลับทุก${duty.period === "weekly" ? "สัปดาห์" : "เดือน"}`}
            {!isCoverage && duty.period === "weekly" && duty.skipSundays && (
              <span className="px-1.5 py-1 rounded-[6px] bg-maroon/10 text-maroon font-bold text-[10px] inline-flex items-center gap-0.5">
                <IconCalendarX size={10} strokeWidth={2.6} />
                ข้ามวันอาทิตย์
              </span>
            )}
            {/* coverage ผูกขาดคนทำเสมอ (ไม่มี toggle — ปิดไม่ได้) ·
                rotation ขึ้นเฉพาะที่ admin เปิด */}
            {(isCoverage || duty.exclusive) && (
              <span
                title={
                  isCoverage
                    ? "หน้าที่แทนคนลาผูกขาดคนทำเสมอ — คนที่มาแทนจะไม่ถูกจัดหน้าที่อื่นในวันนั้น"
                    : undefined
                }
                className="px-1.5 py-1 rounded-[6px] bg-maroon text-white font-bold text-[10px] inline-flex items-center gap-0.5"
              >
                <IconLock size={10} strokeWidth={2.6} />
                ผูกขาดคนทำ
                {isCoverage && (
                  <span className="font-semibold opacity-80">(อัตโนมัติ)</span>
                )}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="shrink-0 px-2.5 py-1.5 rounded-[8px] border border-bdr bg-cream text-txt-mid text-xs font-semibold cursor-pointer font-[inherit] active:scale-[0.96] transition-transform"
        >
          แก้ไข
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label="ลบหน้าที่"
          className="shrink-0 w-8 h-8 rounded-[8px] bg-red-lt flex items-center justify-center cursor-pointer border-[1.5px] border-[#C0392B30] active:scale-[0.92] transition-transform"
        >
          <IconTrash size={13} className="text-red" strokeWidth={2.2} />
        </button>
      </div>

      {/* วันนี้ใครทำ — coverage แสดงทุกเป้าหมายที่ลา */}
      <div className="rounded-[10px] bg-gold-pale/40 border border-gold/30 p-2.5 mb-2.5">
        <div className="text-xs text-txt-soft mb-1.5 inline-flex items-center gap-1">
          <IconCalendarDays size={11} strokeWidth={2.4} />
          วันนี้
        </div>
        <div className="flex flex-col gap-2">
          {(assignments.length > 0 ? assignments : [undefined]).map((a, i) => (
            <TodayRow
              key={a ? `${a.dutyId}-${a.targetEmpId || i}` : i}
              assignment={a}
              empById={empById}
              isCoverage={isCoverage}
              coverageTargetLabel={coverageTargetLabel}
              offTodayLabel={offTodayLabel}
            />
          ))}
        </div>
      </div>

      {/* pool list — rotation: คนที่ admin เลือก · coverage: รายชื่อคนแทน */}
      <div>
        <div className="text-xs text-txt-soft mb-1.5 inline-flex items-center gap-1">
          <IconUsers size={11} strokeWidth={2.4} />
          {isCoverage
            ? `คนที่มาแทนได้ · ${resolvedPool.length} คน`
            : `ลำดับการสลับ · ${resolvedPool.length} คน`}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {resolvedPool.map((emp, idx) => {
            const isCurrent = head?.primaryEmpId === emp.id;
            return (
              <div
                key={emp.id}
                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold ${
                  isCurrent
                    ? "bg-maroon text-white"
                    : "bg-cream text-txt-mid border border-bdr"
                }`}
              >
                <span>{idx + 1}.</span>
                {emp.nickname || emp.name}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
