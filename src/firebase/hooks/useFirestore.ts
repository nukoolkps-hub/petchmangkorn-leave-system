/* ─── Firestore Collection Hooks ──────────────────────────────
   Reusable hooks ที่ใช้ pattern เดียวกัน:
   - subscribe to real-time updates
   - return { data, loading, error }
   - cleanup on unmount                                          */
import { type DependencyList, useEffect, useState } from "react";
import type { Employee, LeaveEntry } from "../../types";
import {
  subscribeEmployeeByLineUserId,
  subscribeEmployees,
} from "../employees";
import { subscribeLeaves } from "../leaves";
import { EMPTY_STORE_CALENDAR, subscribeStoreCalendar } from "../storeCalendar";

interface SubscriptionResult<T> {
  data: T;
  loading: boolean;
  error: Error | null;
}

type SubscribeFn<T> = (
  onChange: (data: T) => void,
  onError?: (err: Error) => void,
) => () => void;

function useScopedSubscription<T>(
  getSubscribeFn: () => SubscribeFn<T> | null,
  defaultValue: T,
  deps: DependencyList,
  options?: { keepPreviousData?: boolean },
): SubscriptionResult<T> {
  const [data, setData] = useState<T>(defaultValue);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const subscribeFn = getSubscribeFn();
    // โดยปกติ reset ทุกครั้งที่ scope/เดือนเปลี่ยน — กันข้อมูล "ชุดเก่า" ค้างแสดง
    // (เช่น เปลี่ยนเดือนในประวัติเบิกเงิน แล้ว query ใหม่ยังไม่มา/ error →
    //  เดิมจะยังโชว์เดือนก่อน). ถ้า keepPreviousData = true จะ "ไม่ล้าง"
    // ข้อมูลเดิม รอแทนเมื่อชุดใหม่มา — ลดอาการ "กระพริบ" (เช่นหน้าจ่ายเงิน
    // ที่ยอดเด้งเป็น 0 ชั่ววินาทีตอนสลับเดือน)
    if (!options?.keepPreviousData) {
      setData(defaultValue);
    }
    setError(null);
    if (!subscribeFn) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = subscribeFn(
      (newData) => {
        setData(newData);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.warn(
          "[Firestore] scoped subscription error (degrading gracefully):",
          err.message,
        );
        // ทุกกรณี error → ล้างข้อมูลเป็นค่าเริ่มต้น ไม่ค้างข้อมูล scope เก่า
        setData(defaultValue);
        if (
          err.message?.includes("permission") ||
          err.message?.includes("allow")
        ) {
          setLoading(false);
        } else {
          setError(err);
          setLoading(false);
        }
      },
    );
    return unsub;
    // biome-ignore lint/correctness/useExhaustiveDependencies: this generic hook accepts the caller's scoped dependency list.
  }, deps);

  return { data, loading, error };
}

/* ─── Specific hooks ─────────────────────────────────────────── */

/** ใบลาทั้งหมด — ทุกคน signed-in อ่านได้ (ปฏิทินทีม + กันยื่นลาทับวันเพื่อน)
 *  ไม่มีฟิลด์อ่อนไหวในใบลา · scope กรองที่ UI ตอนคำนวณเฉพาะตัว */
export function useLeavesForScope({
  isAdmin,
  employeeId,
}: {
  isAdmin: boolean;
  employeeId: string | null;
}) {
  return useScopedSubscription(
    () => {
      if (isAdmin || employeeId) return subscribeLeaves;
      return null;
    },
    [] as LeaveEntry[],
    [isAdmin, employeeId],
  );
}

/** พนักงาน — admin เห็นทุกคน · พนักงานเห็นเฉพาะของตัวเอง (scoped query) */
export function useEmployeesForScope({
  isAdmin,
  authUid,
}: {
  isAdmin: boolean;
  authUid: string;
}) {
  return useScopedSubscription(
    () => {
      if (isAdmin) return subscribeEmployees;
      if (authUid) {
        return (
          onChange: (data: Employee[]) => void,
          onError?: (err: Error) => void,
        ) => subscribeEmployeeByLineUserId(authUid, onChange, onError);
      }
      return null;
    },
    [] as Employee[],
    [isAdmin, authUid],
  );
}

/** ปฏิทินเปิด-ปิดร้าน — public read · admin write · doc เดียว
 *  /config/storeCalendar (ใช้นับวันลาว่าวันไหนนับโควต้า/วันไหนร้านปิด) */
export function useStoreCalendar() {
  return useScopedSubscription(
    () => subscribeStoreCalendar,
    EMPTY_STORE_CALENDAR,
    [],
  );
}
