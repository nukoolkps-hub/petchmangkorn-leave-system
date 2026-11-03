/* ─── Admin: Duty Schedule (ตารางหน้าที่) ──────────────────────────
   Router บางๆ — list การ์ดหน้าที่ + เปิด modal เพิ่ม/แก้/ลบ + ปฏิทินหน้าที่
   DutyCard / DutyEditModal แยกเป็นไฟล์ของตัวเอง                          */

import {
  CalendarClock as IconCalendarClock,
  CalendarRange as IconCalendarRange,
  Plus as IconPlus,
} from "lucide-react";
import { useMemo, useState } from "react";
import type {
  DutyAssignmentsSnapshot,
  SnapshotAssignment,
  SnapshotPoolMember,
} from "../../firebase/dutyAssignments";
import type { Duty, Employee, LeaveEntry, StoreCalendar } from "../../types";
import DutyForecastModal from "../modals/DutyForecastModal";
import BaseModal from "../shared/BaseModal";
import { SkeletonRow } from "../shared/Skeleton";
import DutyCard from "./DutyCard";
import DutyEditModal from "./DutyEditModal";

interface Props {
  duties: Duty[];
  dutiesLoading?: boolean;
  dutyAssignmentsToday: DutyAssignmentsSnapshot | null;
  employeeDirectory: Employee[];
  allLeaves: LeaveEntry[];
  storeCalendar?: StoreCalendar | null;
  onUpsertDuty: (
    id: string | null,
    data: Omit<Duty, "id" | "createdAt" | "updatedAt">,
  ) => Promise<string>;
  onDeleteDuty: (id: string) => Promise<void>;
  showToast?: (msg: string) => void;
}

export default function DutySchedulePanel({
  duties,
  dutiesLoading,
  dutyAssignmentsToday,
  employeeDirectory,
  allLeaves,
  storeCalendar,
  onUpsertDuty,
  onDeleteDuty,
  showToast,
}: Props) {
  const [editing, setEditing] = useState<Duty | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Duty | null>(null);
  const [showForecast, setShowForecast] = useState(false);

  // assignments + pool มาจาก server snapshot — single source of truth
  // กับฝั่งพนักงาน (Firestore rules ปิดให้พนักงานอ่าน peer data ไม่ได้)
  const assignments = useMemo(
    () => dutyAssignmentsToday?.assignments || [],
    [dutyAssignmentsToday],
  );
  // 1 หน้าที่ → assignment หลายรายการได้ (coverage เป้าหมายลาหลายคน)
  const assignmentsByDuty = useMemo(() => {
    const m = new Map<string, SnapshotAssignment[]>();
    for (const a of assignments) {
      const list = m.get(a.dutyId);
      if (list) list.push(a);
      else m.set(a.dutyId, [a]);
    }
    return m;
  }, [assignments]);
  // pool (roster) ต่อ duty — จาก dutyPools (มีทุก duty แม้วันที่หน้าที่นั้นหยุด)
  // fallback pool จาก assignments สำหรับ snapshot เก่าที่ยังไม่มี dutyPools
  const dutyPoolById = useMemo(() => {
    const m = new Map<string, { pool: SnapshotPoolMember[] }>();
    const dp = dutyAssignmentsToday?.dutyPools;
    if (dp) {
      for (const [dutyId, info] of Object.entries(dp)) m.set(dutyId, info);
    } else {
      for (const a of assignments) {
        m.set(a.dutyId, { pool: a.pool });
      }
    }
    return m;
  }, [dutyAssignmentsToday, assignments]);
  const empById = useMemo(() => {
    const m = new Map<string, SnapshotPoolMember>();
    for (const a of assignments) {
      for (const member of a.pool) m.set(member.id, member);
    }
    // รวมสมาชิกจาก dutyPools ด้วย — การ์ดของหน้าที่ที่หยุดวันนี้ (ไม่มีใน
    // assignments) จะได้ resolve ชื่อคนใน pool ได้
    for (const info of dutyPoolById.values()) {
      for (const member of info.pool) m.set(member.id, member);
    }
    return m;
  }, [assignments, dutyPoolById]);

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-3.5">
        <div className="text-sm text-txt-soft">
          ตารางหน้าที่รับผิดชอบ — ระบบหมุนคนอัตโนมัติ + หาคนแทนถ้าลา
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {duties.length > 0 && (
            <button
              type="button"
              onClick={() => setShowForecast(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[10px] border-[1.5px] border-bdr bg-cream text-maroon text-sm font-bold cursor-pointer font-[inherit] active:scale-[0.98] transition-transform duration-100"
            >
              <IconCalendarRange size={15} strokeWidth={2.4} />
              ปฏิทินหน้าที่
            </button>
          )}
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] border-none bg-maroon text-white text-sm font-bold cursor-pointer font-[inherit] shadow-[0_3px_10px_rgba(123,28,28,0.25)] active:scale-[0.98] transition-transform duration-100"
          >
            <IconPlus size={15} strokeWidth={2.4} />
            เพิ่มหน้าที่
          </button>
        </div>
      </div>

      {dutiesLoading && duties.length === 0 ? (
        <div className="flex flex-col gap-2.5 animate-[fadeIn_0.18s_ease-out]">
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : duties.length === 0 ? (
        <div className="text-center text-txt-soft py-12 px-6 bg-white rounded-[14px] border border-dashed border-bdr">
          <div className="flex justify-center mb-3 text-gold">
            <IconCalendarClock size={44} strokeWidth={1.8} />
          </div>
          ยังไม่มีหน้าที่ — เริ่มกดเพิ่ม
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {duties.map((duty) => (
            <DutyCard
              key={duty.id}
              duty={duty}
              assignments={assignmentsByDuty.get(duty.id) || []}
              empById={empById}
              employeeDirectory={employeeDirectory}
              dutyPool={dutyPoolById.get(duty.id)}
              snapshotDate={dutyAssignmentsToday?.date}
              onEdit={() => setEditing(duty)}
              onDelete={() => setConfirmDelete(duty)}
            />
          ))}
        </div>
      )}

      {showForecast && (
        <DutyForecastModal
          duties={duties}
          dutyAssignmentsToday={dutyAssignmentsToday}
          allLeaves={allLeaves}
          storeCalendar={storeCalendar}
          profileId={null}
          employees={employeeDirectory}
          onClose={() => setShowForecast(false)}
        />
      )}

      {editing && (
        <DutyEditModal
          duty={editing === "new" ? null : editing}
          employeeDirectory={employeeDirectory}
          onSave={async (data) => {
            try {
              await onUpsertDuty(editing === "new" ? null : editing.id, data);
            } catch (err) {
              // เดิม error เงียบ → ผู้ใช้เห็นปุ่มกลับมา "บันทึก" แต่ไม่รู้ว่าพลาด
              console.error("[DutySchedulePanel] save duty failed:", err);
              showToast?.("บันทึกไม่สำเร็จ — ลองอีกครั้ง");
              throw err; // คง modal ไว้ให้แก้/ลองใหม่
            }
            showToast?.(editing === "new" ? "เพิ่มหน้าที่แล้ว" : "บันทึกแล้ว");
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}

      {confirmDelete && (
        <BaseModal
          onClose={() => setConfirmDelete(null)}
          maxWidthClass="max-w-[360px]"
          contentClassName="px-6 py-7"
        >
          <div className="text-center">
            <div className="font-bold text-lg text-txt mb-1.5">ลบหน้าที่นี้?</div>
            <div className="text-sm text-txt-mid mb-5">
              "{confirmDelete.name}"
            </div>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-3 rounded-xl border-[1.5px] border-bdr bg-white text-txt-mid font-semibold cursor-pointer font-[inherit] active:scale-[0.98] transition-transform"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = confirmDelete;
                  setConfirmDelete(null);
                  onDeleteDuty(target.id)
                    .then(() => showToast?.("ลบหน้าที่แล้ว"))
                    .catch((err: unknown) => {
                      showToast?.(
                        err instanceof Error
                          ? `ลบไม่สำเร็จ: ${err.message}`
                          : "ลบไม่สำเร็จ",
                      );
                      setConfirmDelete(target);
                    });
                }}
                className="flex-1 py-3 rounded-xl border-none bg-red text-white font-bold cursor-pointer font-[inherit] active:scale-[0.98] transition-transform"
              >
                ลบ
              </button>
            </div>
          </div>
        </BaseModal>
      )}
    </div>
  );
}
