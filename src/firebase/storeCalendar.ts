/* ─── Store calendar — ปฏิทินวันเปิด-ปิดร้าน ─────────────────────────
   doc เดียว: /config/storeCalendar
   - extraOpenSaturdays:  เสาร์ที่ admin เปิดพิเศษ
   - extraClosedWeekdays: จ-ศ ที่ admin ปิดพิเศษ                          */

import { doc, onSnapshot, setDoc } from "firebase/firestore";
import type { StoreCalendar } from "../types";
import { db } from "./config";

const CAL_PATH = "config/storeCalendar";

const EMPTY: StoreCalendar = {
  extraOpenSaturdays: [],
  extraClosedWeekdays: [],
  extraClosedSundays: [],
};

export function subscribeStoreCalendar(
  onChange: (cal: StoreCalendar) => void,
  onError?: (err: Error) => void,
) {
  return onSnapshot(
    doc(db, CAL_PATH),
    (snap) => {
      const data = snap.exists() ? (snap.data() as Partial<StoreCalendar>) : {};
      onChange({
        extraOpenSaturdays: Array.isArray(data.extraOpenSaturdays)
          ? data.extraOpenSaturdays
          : [],
        extraClosedWeekdays: Array.isArray(data.extraClosedWeekdays)
          ? data.extraClosedWeekdays
          : [],
        extraClosedSundays: Array.isArray(data.extraClosedSundays)
          ? data.extraClosedSundays
          : [],
      });
    },
    (err) => {
      console.error("[StoreCalendar] subscribe error:", err);
      onError?.(err);
    },
  );
}

export async function updateStoreCalendar(cal: StoreCalendar): Promise<void> {
  // sort + dedup ก่อนเขียน — กัน admin เพิ่มวันเดียวซ้ำ + ดูง่ายใน console
  const norm = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort();
  const openSet = new Set(norm(cal.extraOpenSaturdays));
  await setDoc(
    doc(db, CAL_PATH),
    {
      extraOpenSaturdays: [...openSet].sort(),
      extraClosedWeekdays: norm(cal.extraClosedWeekdays),
      extraClosedSundays: norm(cal.extraClosedSundays ?? []),
      updatedAt: Date.now(),
    },
    { merge: true },
  );
}

export const EMPTY_STORE_CALENDAR = EMPTY;
