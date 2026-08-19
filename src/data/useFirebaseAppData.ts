/* ─── useFirebaseAppData — data layer ของระบบการลา ────────────────
   รวม subscription (real-time) + CRUD ไว้ที่เดียว · App.tsx เรียกผ่าน
   `useAppData` แล้วส่งต่อเป็น props ให้หน้าต่างๆ

   Scope ของ subscription:
   - employees → admin เห็นทุกคน · พนักงานเห็นเฉพาะของตัวเอง
   - leaves    → ทุกคน signed-in อ่านได้ (ปฏิทินทีม + กันยื่นลาทับวัน)
   - storeCalendar → public read · admin write                        */

import { useCallback, useMemo } from "react";
import {
  deleteEmployee as deleteEmployeeDoc,
  reorderEmployees as reorderEmployeesDocs,
  updateEmployee as updateEmployeeDoc,
  upsertEmployee as upsertEmployeeDoc,
} from "../firebase/employees";
import {
  useEmployeesForScope,
  useLeavesForScope,
  useStoreCalendar,
} from "../firebase/hooks/useFirestore";
import {
  addLeave as addLeaveDoc,
  deleteLeave as deleteLeaveDoc,
  updateLeave as updateLeaveDoc,
} from "../firebase/leaves";
import { updateStoreCalendar as updateStoreCalendarDoc } from "../firebase/storeCalendar";
import type { AppData, Employee, LeaveEntry, StoreCalendar } from "../types";

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
        return await addLeaveDoc(leave);
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
        return await upsertEmployeeDoc(employee.id, employee);
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
      } catch (err) {
        warn("บันทึกปฏิทินร้านไม่สำเร็จ", err);
        throw err;
      }
    },
    [warn, storeCalendarResult.data],
  );

  return {
    allLeaves,
    employeeDirectory,
    storeCalendar: storeCalendarResult.data,
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
  };
}
