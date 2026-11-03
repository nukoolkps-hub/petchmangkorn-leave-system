/* ─── useFirebaseAppData — data layer ของระบบการลา ────────────────
   รวม subscription (real-time) + CRUD ไว้ที่เดียว · App.tsx เรียกผ่าน
   `useAppData` แล้วส่งต่อเป็น props ให้หน้าต่างๆ

   Scope ของ subscription:
   - employees → admin เห็นทุกคน · พนักงานเห็นเฉพาะของตัวเอง
   - leaves    → ทุกคน signed-in อ่านได้ (ปฏิทินทีม + กันยื่นลาทับวัน)
   - storeCalendar → public read · admin write
   - duties + dutyAssignmentsToday → public read (snapshot คำนวณโดย
     Cloud Function) · ทุก CRUD ที่กระทบการหมุนเวร (ใบลา/พนักงาน/ปฏิทิน
     ร้าน/หน้าที่) ต้องเรียก triggerRecomputeDutyAssignments() ต่อท้าย
     ไม่งั้น "หน้าที่วันนี้" ค้างของเดิมจนถึงรอบ 00:01                  */

import { useCallback, useMemo } from "react";
import {
  deleteDuty as deleteDutyDoc,
  upsertDuty as upsertDutyDoc,
} from "../firebase/duties";
import { triggerRecomputeDutyAssignments } from "../firebase/dutyAssignments";
import {
  deleteEmployee as deleteEmployeeDoc,
  reorderEmployees as reorderEmployeesDocs,
  updateEmployee as updateEmployeeDoc,
  upsertEmployee as upsertEmployeeDoc,
} from "../firebase/employees";
import {
  useDuties,
  useDutyAssignments,
  useEmployeesForScope,
  useLeavesForScope,
  usePayrollPeriods,
  useStoreCalendar,
} from "../firebase/hooks/useFirestore";
import {
  addLeave as addLeaveDoc,
  deleteLeave as deleteLeaveDoc,
  updateLeave as updateLeaveDoc,
} from "../firebase/leaves";
import {
  closePayrollPeriod as closePayrollPeriodDoc,
  finalizePayrollPeriod as finalizePayrollPeriodDoc,
  relockPayrollPeriod as relockPayrollPeriodDoc,
  reopenPayrollPeriod as reopenPayrollPeriodDoc,
} from "../firebase/payrollPeriods";
import { updateStoreCalendar as updateStoreCalendarDoc } from "../firebase/storeCalendar";
import type {
  AppData,
  Duty,
  Employee,
  LeaveEntry,
  StoreCalendar,
} from "../types";

interface Args {
  authUid: string;
  isAdmin: boolean;
  onWarning?: (msg: string) => void;
}

export default function useFirebaseAppData({
  authUid,
  isAdmin,
  onWarning,
}: Args): AppData {
  const employeesResult = useEmployeesForScope({ isAdmin, authUid });
  const employeeDirectory = employeesResult.data as Employee[];

  // ต้องรู้ employeeId ของตัวเองก่อน ถึงจะ subscribe leaves ได้
  // (พนักงานที่ยังไม่ผูก LINE → ไม่มี doc → ไม่ subscribe)
  const myEmployeeId = useMemo(() => {
    if (isAdmin) return null;
    return employeeDirectory.find((e) => e.lineUserId === authUid)?.id ?? null;
  }, [isAdmin, employeeDirectory, authUid]);

  const leavesResult = useLeavesForScope({
    isAdmin,
    employeeId: myEmployeeId,
  });
  const allLeaves = leavesResult.data as LeaveEntry[];

  const storeCalendarResult = useStoreCalendar();
  const payrollPeriodsResult = usePayrollPeriods();
  const dutiesResult = useDuties();
  const dutyAssignmentsResult = useDutyAssignments();

  const error = employeesResult.error || leavesResult.error || null;

  /* ─── CRUD — wrap ให้ error ขึ้น toast แทนที่จะเงียบ ─────────── */
  const warn = useCallback(
    (msg: string, err: unknown) => {
      console.error(msg, err);
      onWarning?.(msg);
    },
    [onWarning],
  );

  const addLeave = useCallback(
    async (leave: Omit<LeaveEntry, "id">) => {
      try {
        const id = await addLeaveDoc(leave);
        triggerRecomputeDutyAssignments();
        return id;
      } catch (err) {
        warn("บันทึกใบลาไม่สำเร็จ", err);
        throw err;
      }
    },
    [warn],
  );

  const deleteLeave = useCallback(
    async (id: string | number) => {
      try {
        await deleteLeaveDoc(id);
        triggerRecomputeDutyAssignments();
      } catch (err) {
        warn("ลบใบลาไม่สำเร็จ", err);
        throw err;
      }
    },
    [warn],
  );

  /** ชื่อ/ชื่อเล่นใน leave doc เป็น snapshot ณ เวลายื่น — ถ้า admin แก้ชื่อ
   *  พนักงาน ต้อง re-stamp ใบลาของคนนั้นด้วย ไม่งั้นปฏิทินทีมยังโชว์ชื่อเก่า */
  const restampLeaveSnapshot = useCallback(
    async (employeeId: string, name: string, nickname?: string | null) => {
      const mine = allLeaves.filter((lv) => lv.employeeId === employeeId);
      await Promise.all(
        mine
          .filter(
            (lv) =>
              lv.employeeName !== name ||
              (lv.employeeNickname ?? null) !== (nickname ?? null),
          )
          .map((lv) =>
            updateLeaveDoc(String(lv.id), {
              employeeName: name,
              employeeNickname: nickname ?? null,
            }),
          ),
      );
    },
    [allLeaves],
  );

  const updateEmployee = useCallback(
    async (id: string, fields: Partial<Employee>) => {
      try {
        await updateEmployeeDoc(id, fields);
        if (fields.name !== undefined || fields.nickname !== undefined) {
          const current = employeeDirectory.find((e) => e.id === id);
          const name = fields.name ?? current?.name ?? "";
          const nickname = fields.nickname ?? current?.nickname ?? null;
          if (name) await restampLeaveSnapshot(id, name, nickname);
        }
        // ชื่อ/รูปใน snapshot หน้าที่เป็นสำเนา — แก้ข้อมูลพนักงานต้องคิดใหม่
        triggerRecomputeDutyAssignments();
      } catch (err) {
        warn("บันทึกข้อมูลพนักงานไม่สำเร็จ", err);
        throw err;
      }
    },
    [warn, employeeDirectory, restampLeaveSnapshot],
  );

  const upsertEmployee = useCallback(
    async (employee: Employee) => {
      try {
        const id = await upsertEmployeeDoc(employee.id, employee);
        triggerRecomputeDutyAssignments();
        return id;
      } catch (err) {
        warn("บันทึกข้อมูลพนักงานไม่สำเร็จ", err);
        throw err;
      }
    },
    [warn],
  );

  const deleteEmployee = useCallback(
    async (id: string) => {
      try {
        await deleteEmployeeDoc(id);
        triggerRecomputeDutyAssignments();
      } catch (err) {
        warn("ลบพนักงานไม่สำเร็จ", err);
        throw err;
      }
    },
    [warn],
  );

  const reorderEmployees = useCallback(
    async (orderedIds: string[]) => {
      try {
        await reorderEmployeesDocs(orderedIds);
        // ลำดับ pool ของหน้าที่ = displayOrder → ลากเรียงแล้วเวรขยับตาม
        triggerRecomputeDutyAssignments();
      } catch (err) {
        warn("เรียงลำดับพนักงานไม่สำเร็จ", err);
        throw err;
      }
    },
    [warn],
  );

  const updateStoreCalendar = useCallback(
    async (fields: Partial<StoreCalendar>) => {
      try {
        await updateStoreCalendarDoc({
          ...storeCalendarResult.data,
          ...fields,
        });
        // วันร้านปิดไม่มีหน้าที่ — เปิด/ปิดร้านวันนี้ต้องคิดใหม่
        triggerRecomputeDutyAssignments();
      } catch (err) {
        warn("บันทึกปฏิทินร้านไม่สำเร็จ", err);
        throw err;
      }
    },
    [warn, storeCalendarResult.data],
  );

  const upsertDuty = useCallback(
    async (
      id: string | null,
      data: Omit<Duty, "id" | "createdAt" | "updatedAt">,
    ) => {
      // ไม่ warn ที่นี่ — DutySchedulePanel ขึ้น toast เองแล้วคง modal ไว้
      const newId = await upsertDutyDoc(id, data);
      triggerRecomputeDutyAssignments();
      return newId;
    },
    [],
  );

  const deleteDuty = useCallback(async (id: string) => {
    await deleteDutyDoc(id);
    triggerRecomputeDutyAssignments();
  }, []);

  return {
    allLeaves,
    employeeDirectory,
    storeCalendar: storeCalendarResult.data,
    periodCutoffs: payrollPeriodsResult.data.cutoffs,
    periodSnapshots: payrollPeriodsResult.data.snapshots,
    duties: dutiesResult.data,
    dutiesLoading: dutiesResult.loading,
    dutyAssignmentsToday: dutyAssignmentsResult.data,
    loading: employeesResult.loading,
    leavesLoading: leavesResult.loading,
    error,
    addLeave,
    deleteLeave,
    updateEmployee,
    upsertEmployee,
    deleteEmployee,
    reorderEmployees,
    updateStoreCalendar,
    upsertDuty,
    deleteDuty,
    closePayrollPeriod: closePayrollPeriodDoc,
    reopenPayrollPeriod: reopenPayrollPeriodDoc,
    relockPayrollPeriod: relockPayrollPeriodDoc,
    finalizePayrollPeriod: finalizePayrollPeriodDoc,
  };
}
