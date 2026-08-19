/* ─── useLeaveForm — Leave request form logic ────────────────── */

import { useState } from "react";
import type { LeaveEntry, StoreCalendar } from "../types";
import {
  addDaysYmd,
  countWorkdays,
  fmtShort,
  todayYmd,
} from "../utils/dateUtils";

interface UseLeaveFormOptions {
  profileName: string | null;
  allLeaves: LeaveEntry[];
  employeeDirectory: {
    id: string;
    name: string;
    nickname?: string;
    balance?: any;
    used?: any;
  }[];
  storeCalendar?: StoreCalendar | null;
  addLeave: (
    leave: Omit<LeaveEntry, "id">,
  ) => string | number | Promise<string>;
  deleteLeave: (id: string | number) => void | Promise<void>;
  authUid: string;
  showToast: (msg: string) => void;
}

export default function useLeaveForm({
  profileName,
  allLeaves,
  employeeDirectory,
  storeCalendar,
  addLeave,
  deleteLeave,
  authUid,
  showToast,
}: UseLeaveFormOptions) {
  const [form, setForm] = useState({ type: "", startDate: "", endDate: "" });
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [histDetail, setHistDetail] = useState<string | number | null>(null);

  /* ─── Derived values ───────────────────────────────────────── */
  // filter ด้วย employeeId (ไม่ใช่ชื่อ) — กันชื่อใน Firestore mismatch กับ
  // profile.name (โดน rename / space / ตัวพิมพ์) แล้วประวัติว่างเปล่า
  const myLeaves = allLeaves.filter(
    (lv) => authUid && lv.employeeId === authUid,
  );

  const employeeEntry = employeeDirectory.find(
    (e) => authUid && e.id === authUid,
  );
  const balance = employeeEntry?.balance || { personal: 15, sick: 15 };
  const used = employeeEntry?.used || { personal: 0, sick: 0 };

  const days = countWorkdays(form.startDate, form.endDate, storeCalendar);
  const remain = form.type ? balance[form.type] - used[form.type] : null;
  const overLimit = remain !== null && days > remain;

  /* ─── Validation ───────────────────────────────────────────── */
  function validate() {
    const e: Record<string, string> = {};
    if (!form.type) e.type = "กรุณาเลือกประเภทการลา";
    if (!form.startDate) e.startDate = "กรุณาเลือกวันที่เริ่มลา";
    if (!form.endDate) e.endDate = "กรุณาเลือกวันที่สิ้นสุด";
    if (form.startDate && form.endDate && form.endDate < form.startDate)
      e.endDate = "วันที่สิ้นสุดต้องไม่ก่อนวันเริ่มต้น";
    // ลาป่วยล่วงหน้าได้ไม่เกิน 2 อาทิตย์ · เรียก todayYmd() เพื่อไม่ stale
    // ข้าม midnight ใน session ที่เปิดค้างทั้งคืน
    if (form.type === "sick") {
      const sickMaxDate = addDaysYmd(todayYmd(), 14);
      if (form.startDate && form.startDate > sickMaxDate)
        e.startDate = "ลาป่วยล่วงหน้าได้ไม่เกิน 2 อาทิตย์";
      if (form.endDate && form.endDate > sickMaxDate)
        e.endDate = "ลาป่วยล่วงหน้าได้ไม่เกิน 2 อาทิตย์";
    }
    if (overLimit) e.over = `วันลาเกินสิทธิ์คงเหลือ (${remain} วัน)`;
    // กันยื่นลาวันร้านปิดทั้งหมด (เช่นเลือกเสาร์ปิด หรือ จ-ศ ที่ admin ปิด)
    // → days = 0 · Firestore rules ปฏิเสธอยู่แล้ว แต่ต้องบอก user ก่อน
    if (
      form.startDate &&
      form.endDate &&
      form.startDate <= form.endDate &&
      days === 0
    )
      e.over = "วันที่เลือกตรงกับวันร้านปิด · ลาวันร้านปิดไม่นับ";
    // กันลาทับวันที่ลาไปแล้ว — เช็คทับซ้อนกับ leave อื่นของพนักงานคนเดียวกัน
    if (form.startDate && form.endDate && form.endDate >= form.startDate) {
      const conflict = myLeaves.find(
        (lv) => lv.start <= form.endDate && lv.end >= form.startDate,
      );
      if (conflict) {
        const range =
          conflict.start === conflict.end
            ? fmtShort(conflict.start)
            : `${fmtShort(conflict.start)} → ${fmtShort(conflict.end)}`;
        e.over = `วันที่เลือกทับกับใบลาเดิม (${range})`;
      }
    }
    return e;
  }

  /** run validate() + setErrors() · return true ถ้าไม่มี error · ใช้ตอน
   *  เปิด confirm modal ก่อนยื่นจริง (ถ้า invalid → ขึ้น error inline ไม่เปิด modal) */
  function validateAndSetErrors(): boolean {
    const e = validate();
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  /* ─── Submit — writes to Firestore ─────────────────────────── */
  async function submit(profile: {
    name: string;
    avatar: string;
    avatarType: string;
  }) {
    const e = validate();
    if (Object.keys(e).length) {
      setErrors(e);
      return;
    }
    setErrors({});
    const now = new Date().toLocaleDateString("th-TH", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    try {
      await addLeave({
        employeeId: authUid,
        employeeName: profile.name,
        // ?? null กัน Firestore reject undefined (config.ts ไม่ได้เปิด
        // ignoreUndefinedProperties · พนักงานที่ไม่ตั้งชื่อเล่นจะกลายเป็น undefined)
        employeeNickname: employeeEntry?.nickname ?? null,
        type: form.type as "personal" | "sick",
        start: form.startDate,
        end: form.endDate,
        days,
        reason: "",
        submitted: now,
      });
      setSubmitted(true);
    } catch (err) {
      console.error("[useLeaveForm] submit error:", err);
      showToast(
        err instanceof Error && err.message
          ? err.message
          : "เกิดข้อผิดพลาดในการบันทึก กรุณาลองใหม่",
      );
    }
  }

  /* ─── Reset ────────────────────────────────────────────────── */
  function reset() {
    setForm({ type: "", startDate: "", endDate: "" });
    setSubmitted(false);
    setErrors({});
  }

  /* ─── Delete — deletes from Firestore ──────────────────────── */
  async function handleDelete(id: string | number) {
    try {
      await deleteLeave(id);
      showToast("ลบรายการลาเรียบร้อยแล้ว");
    } catch (err) {
      console.error("[useLeaveForm] delete error:", err);
      showToast(
        err instanceof Error && err.message
          ? err.message
          : "ลบรายการไม่สำเร็จ กรุณาลองใหม่",
      );
    }
  }

  return {
    form,
    setForm,
    errors,
    submitted,
    setSubmitted,
    histDetail,
    setHistDetail,
    myLeaves,
    balance,
    used,
    days,
    remain,
    overLimit,
    validate,
    validateAndSetErrors,
    submit,
    reset,
    handleDelete,
  };
}
