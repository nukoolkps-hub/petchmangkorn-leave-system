import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Briefcase as IconBriefcase,
  GripVertical as IconGrip,
  MessageCircle as IconMessageCircle,
  Settings as IconSettings,
  Trash2 as IconTrash,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { COLORS } from "../../constants";
import type { Employee } from "../../types";
import AvatarCircle from "../shared/AvatarCircle";
import BaseModal from "../shared/BaseModal";
import EmployeeEditModal from "./EmployeeEditModal";
import { clearEmployeeDraft, hasEmployeeDraft } from "./employeeEditFields";

interface EmployeeAdminPanelProps {
  employeeDirectory: Employee[];
  onUpdateRole: (employeeId: string, field: string, value: unknown) => void;
  onDeleteEmployee: (employeeId: string) => void;
  // ลากเรียงลำดับพนักงาน → save displayOrder ลง Firestore → sync ทุก device
  onReorderEmployees?: (orderedIds: string[]) => Promise<unknown>;
  // draft + employee ที่เปิดอยู่ ถูกยกขึ้นไป AdminPanel — เพื่อให้ draft ที่ยัง
  // ไม่บันทึก (และ modal ที่เปิดค้าง) รอดเมื่อ admin สลับ section แล้วกลับมา
  editingRole: Record<string, any>;
  setEditingRole: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  editingEmpId: string | null;
  setEditingEmpId: React.Dispatch<React.SetStateAction<string | null>>;
}

/* ─── Admin: Employee management (list + edit modal) ───────────── */
export default function EmployeeAdminPanel({
  employeeDirectory,
  onUpdateRole,
  onDeleteEmployee,
  onReorderEmployees,
  editingRole,
  setEditingRole,
  editingEmpId,
  setEditingEmpId,
}: EmployeeAdminPanelProps) {
  const [confirmDeleteEmp, setConfirmDeleteEmp] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [copiedLineId, setCopiedLineId] = useState<string | null>(null);

  // ลำดับ optimistic ระหว่างลาก — sync จาก Firestore เมื่อ set ของ id เปลี่ยน
  // (เพิ่ม/ลบคน) เพื่อกัน "กระตุก" ตอน reorder array พร้อม Firestore snapshot
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);

  useEffect(() => {
    if (!localOrder) return;
    const fromProps = employeeDirectory
      .map((e) => e.id)
      .sort()
      .join(",");
    const fromLocal = [...localOrder].sort().join(",");
    if (fromProps !== fromLocal) setLocalOrder(null);
  }, [employeeDirectory, localOrder]);

  const orderedEmployees = useMemo(() => {
    if (!localOrder) return employeeDirectory;
    const byId = new Map(employeeDirectory.map((e) => [e.id, e]));
    return localOrder
      .map((id) => byId.get(id))
      .filter((e): e is Employee => Boolean(e));
  }, [employeeDirectory, localOrder]);

  const ids = orderedEmployees.map((e) => e.id);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(ids, oldIndex, newIndex);
    setLocalOrder(next);
    onReorderEmployees?.(next).catch((err) => {
      console.error("[reorderEmployees] failed:", err);
      setLocalOrder(null); // rollback ถ้า save fail
    });
  }

  function copyLineId(text: string | undefined, employeeId: string) {
    if (!text) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          setCopiedLineId(employeeId);
          setTimeout(() => setCopiedLineId(null), 1500);
        })
        .catch(() => {});
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopiedLineId(employeeId);
        setTimeout(() => setCopiedLineId(null), 1500);
      } catch (_e) {}
      document.body.removeChild(ta);
    }
  }

  const editingEmployee = employeeDirectory.find((e) => e.id === editingEmpId);

  return (
    <div>
      <div className="flex items-center justify-between mb-3.5 gap-2">
        {/* flex + items-center → ไอคอน grip จัดกึ่งกลางบรรทัดเป๊ะ ไม่ลอย
            (vertical-align บน inline SVG ไม่ตรงกับ baseline ฟอนต์ไทย) */}
        <div className="text-sm text-txt-soft flex flex-wrap items-center gap-x-1">
          <span>กดที่ชื่อพนักงานเพื่อแก้ไข · ลากปุ่ม</span>
          <IconGrip size={13} strokeWidth={2.4} className="shrink-0" />
          <span>เพื่อเรียงลำดับ</span>
        </div>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2.5">
            {orderedEmployees.map((employee) => (
              <SortableEmployeeRow
                key={employee.id}
                employee={employee}
                dirty={hasEmployeeDraft(editingRole, employee.id)}
                onOpen={() => setEditingEmpId(employee.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {editingEmployee && (
        <EmployeeEditModal
          employee={editingEmployee}
          editingRole={editingRole}
          setEditingRole={setEditingRole}
          onUpdateRole={onUpdateRole}
          copiedLineId={copiedLineId}
          copyLineId={copyLineId}
          onClose={() => setEditingEmpId(null)}
          onRequestDelete={() => {
            setEditingEmpId(null);
            setConfirmDeleteEmp({
              id: editingEmployee.id,
              name: editingEmployee.name,
            });
          }}
        />
      )}

      {confirmDeleteEmp && (
        <BaseModal
          onClose={() => setConfirmDeleteEmp(null)}
          zIndexClass="z-1000"
          maxWidthClass="max-w-[360px]"
          overlayClassName="px-6 bg-[rgba(45,26,14,0.55)] backdrop-blur-xs"
          contentClassName="rounded-[20px] px-6 py-7"
        >
          <div className="w-14 h-14 rounded-full bg-red-lt flex items-center justify-center mx-auto mb-4">
            <IconTrash size={26} color="var(--color-red)" strokeWidth={2.5} />
          </div>
          <div className="font-bold text-lg text-txt text-center mb-2">
            ลบพนักงานคนนี้?
          </div>
          <div className="text-sm text-txt-mid text-center mb-5 leading-[1.8]">
            <b>{confirmDeleteEmp.name}</b>
            <br />
            ข้อมูลทั้งหมดจะถูกลบ (ใบลา · เบิกล่วงหน้า · เงินกู้ · เงินเดือน ทุกเดือน)
            <br />
            <span className="text-sm text-red">การลบจะไม่สามารถกู้คืนได้</span>
          </div>
          <div className="flex gap-2.5">
            <button
              onClick={() => setConfirmDeleteEmp(null)}
              className="flex-1 p-3.5 rounded-xl border-[1.5px] border-bdr bg-white text-txt-mid text-base font-semibold cursor-pointer font-[inherit] active:scale-[0.98] transition-transform duration-100"
            >
              ยกเลิก
            </button>
            <button
              onClick={() => {
                onDeleteEmployee(confirmDeleteEmp.id);
                // เก็บกวาด draft ของคนที่ถูกลบ ไม่ให้ค้างใน editingRole
                setEditingRole((prev) =>
                  clearEmployeeDraft(prev, confirmDeleteEmp.id),
                );
                setConfirmDeleteEmp(null);
              }}
              className="flex-1 p-3.5 rounded-xl border-none bg-red text-white text-base font-bold cursor-pointer font-[inherit] shadow-[0_4px_12px_rgba(192,57,43,0.31)] active:scale-[0.98] transition-transform duration-100"
            >
              ลบพนักงาน
            </button>
          </div>
        </BaseModal>
      )}
    </div>
  );
}

/* ─── แถวพนักงานที่ลากเรียงลำดับได้ ─────────────────────────────────
   กดที่เนื้อแถว (ปุ่มหลัก) → เปิด modal แก้ไข · ลาก grip handle → reorder
   (drag listener อยู่ที่ handle เท่านั้น กันคลิกพลาด/เปิด modal ตอนลาก) */
function SortableEmployeeRow({
  employee,
  dirty,
  onOpen,
}: {
  employee: Employee;
  dirty: boolean;
  onOpen: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: employee.id });

  // pressing = กดค้างที่ปุ่มจับลากแล้ว แต่ยังไม่ขยับถึง threshold (6px)
  // → ใช้โชว์เอฟเฟกต์ "ยกลอย" ทันทีที่กด ให้รู้ว่ากำลังจะเลื่อนแถวไหน
  const [pressing, setPressing] = useState(false);
  // ปล่อยนิ้ว/ยกเลิกที่ไหนก็ได้ → เลิก pressing (pointerup อาจไม่ยิงที่ตัวปุ่ม
  // เพราะ drag จับ pointer ไปที่ window แล้ว)
  useEffect(() => {
    if (!pressing) return;
    const clear = () => setPressing(false);
    window.addEventListener("pointerup", clear);
    window.addEventListener("pointercancel", clear);
    return () => {
      window.removeEventListener("pointerup", clear);
      window.removeEventListener("pointercancel", clear);
    };
  }, [pressing]);

  const lifted = pressing || isDragging;
  // transform/transition ของแถวปล่อยให้ dnd-kit คุมล้วนๆ (ตามนิ้ว + drop
  // animation) — ไม่แตะ transform เองเลย กันชนกับการลาก
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.92 : 1,
    zIndex: lifted ? 30 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      // ⚠️ ห้ามใส่ transform ใน transition — dnd-kit อัปเดต transform ตามนิ้ว
      // ทุกเฟรม ถ้า CSS ease 150ms ตัวที่ลากจะตามช้า = กระตุก · ปล่อย transform
      // ให้ dnd-kit (style.transition) คุม · transition แค่ visual ยกลอย
      // (เอฟเฟกต์ยกลอยสื่อผ่านขอบทอง+พื้นทองอ่อน+เงา ไม่ต้องใช้ scale)
      className={`w-full flex items-center gap-2 pr-2 rounded-2xl border transition-[box-shadow,background-color,border-color] duration-150 ${
        lifted
          ? "border-gold bg-gold-pale shadow-[0_10px_26px_rgba(123,28,28,0.22)]"
          : "border-bdr bg-white shadow-[0_2px_8px_rgba(90,30,10,0.06)]"
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex-1 min-w-0 flex items-center gap-3 pl-3.5 py-3 cursor-pointer text-left font-[inherit] transition-[background-color,transform] duration-150 hover:bg-cream/70 active:scale-[0.99] active:bg-cream rounded-l-2xl"
      >
        <AvatarCircle
          avatar={employee.avatar}
          avatarType={employee.avatarType}
          avatarImageUrl={employee.avatarImageUrl}
          size={40}
          fontSize={13}
          border={`2px solid ${COLORS.gold}40`}
        />
        <div className="flex-1 min-w-0">
          <div className="font-bold text-txt text-sm truncate">
            {employee.name}
          </div>
          <div className="text-xs text-txt-soft mt-px flex items-center gap-[5px] flex-wrap">
            <IconBriefcase size={11} strokeWidth={2.4} />
            {employee.role || "-"}
            {employee.lineUserId && (
              <span className="px-1.5 py-1 rounded-md bg-[#06C75520] text-[#06A04E] font-bold text-xs inline-flex items-center gap-0.5">
                <IconMessageCircle size={10} strokeWidth={2.4} />
                LINE
              </span>
            )}
          </div>
        </div>
        {dirty && (
          <span className="px-2 py-1 rounded-lg text-xs font-bold bg-[#D9770630] text-amber">
            มีการแก้ไข
          </span>
        )}
        <IconSettings
          size={16}
          color={COLORS.textSoft}
          strokeWidth={2.2}
          className="shrink-0"
        />
      </button>
      {/* drag handle — แตะค้างแล้วลากเพื่อเรียงลำดับ
          onPointerDown: เปิดเอฟเฟกต์ "ยกลอย" ทันที + ยังเรียก listener เดิม
          ของ dnd-kit ต่อ (spread มาก่อนแล้ว override → ต้องเรียกเองในนี้) */}
      <button
        type="button"
        aria-label="ลากเพื่อเรียงลำดับ"
        {...attributes}
        {...listeners}
        onPointerDown={(e) => {
          setPressing(true);
          (listeners as any)?.onPointerDown?.(e);
        }}
        className={`shrink-0 self-stretch px-1.5 flex items-center cursor-grab active:cursor-grabbing touch-none font-[inherit] rounded-r-2xl transition-colors duration-150 ${
          lifted ? "text-maroon" : "text-txt-soft hover:bg-cream/70"
        }`}
      >
        <IconGrip size={18} strokeWidth={2.2} />
      </button>
    </div>
  );
}
