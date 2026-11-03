/* ─── Domain types — ระบบการลา ห้างทองเพชรมังกร ────────────────── */

import type { DutyAssignmentsSnapshot } from "../firebase/dutyAssignments";
import type { PeriodCutoffs } from "../utils/payrollPeriod";
import type {
  PeriodSnapshot,
  PeriodSnapshots,
} from "../utils/periodSettlement";

export type LeaveKind = "personal" | "sick";
export type LeaveBalance = Record<LeaveKind, number>;

export interface Employee {
  id: string;
  name: string;
  /** ชื่อเล่น — แสดงในปฏิทินการลา + รายการลา + สรุปเช้า LINE */
  nickname?: string;
  avatar: string;
  avatarType: "text" | "emoji" | "image";
  avatarImageUrl: string | null;
  /** ตำแหน่ง — ข้อความอิสระที่ admin พิมพ์เอง (เช่น "พนักงานขาย") */
  role: string;
  lineUserId?: string;
  /** YYYY-MM เดือนที่เริ่มงาน */
  startWorkMonth?: string;
  prefix?: "นาย" | "นาง" | "นางสาว";
  /** ลำดับการเรียงการ์ดในหน้า admin — admin ลากย้ายได้ · sync ทุกคน */
  displayOrder?: number;
  balance?: LeaveBalance;
  used?: LeaveBalance;
}

export interface LeaveEntry {
  id: string | number;
  /** snapshot ชื่อ ณ เวลายื่น — ให้เพื่อนร่วมงานอ่านได้โดยไม่ต้องเปิด /employees */
  employeeName: string;
  employeeNickname?: string | null;
  employeeId: string;
  type: LeaveKind;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
  days: number;
  reason?: string;
  submitted?: string;
  createdAt?: number;
  /** true = admin เพิ่มให้ (ไม่ใช่พนักงานยื่นเอง) */
  createdByAdmin?: boolean;
}

/** ปฏิทินวันเปิด-ปิดร้าน (admin-managed · doc เดียว: config/storeCalendar)
 *  Default: อาทิตย์ = เปิด · เสาร์ = ปิด · จ-ศ = เปิด                    */
export interface StoreCalendar {
  /** เสาร์ที่ admin เปิดพิเศษ (นับเป็นวันทำงานปกติ) */
  extraOpenSaturdays: string[]; // ["YYYY-MM-DD", ...]
  /** จ-ศ ที่ admin ปิดพิเศษ (เช่น วันอบรม) — ลาวันนั้นไม่นับ */
  extraClosedWeekdays: string[];
  /** อาทิตย์ที่ admin ปิดพิเศษ — ลาวันนั้นไม่นับ */
  extraClosedSundays?: string[];
}

/** ตารางหน้าที่ (admin-managed · collection `duties`) — ระบบหมุนคนให้เอง
 *  + หาคนแทนเมื่อคนที่ถึงเวรลา
 *
 *  ต่างจากระบบเพชรทองมุกดา: ที่นี่ไม่มี collection ตำแหน่ง (`Employee.role`
 *  เป็นข้อความอิสระ) จึงให้ admin **เลือกคนรายชื่อ** แทนการผูกกับตำแหน่ง ·
 *  ไม่มีเรื่องเงิน (ค่าแทน / สิทธิ์กองกลาง) — ระบบนี้ทำเฉพาะการลา
 *
 *  weekly = สลับทุก 7 วัน · monthly = สลับทุกเดือนตามปฏิทิน
 *  rotationStartDate = anchor ของ round-robin (วันแรกของ index 0)        */
export interface Duty {
  id: string;
  name: string;
  /** "rotation" (default) → หมุนเวียนตามรอบ · "coverage" → เวรแทนคนลา
   *  ของคนกลุ่มเป้าหมาย (เลือกคนแทนจาก candidateEmpIds ให้ยุติธรรม)   */
  kind?: "rotation" | "coverage";
  period: "weekly" | "monthly";
  /** (rotation) คนที่หมุนทำหน้าที่นี้ — ลำดับจริงเรียงตาม displayOrder ของ
   *  พนักงาน (admin ลากเรียงที่หน้า "พนักงาน") ไม่ใช่ลำดับใน array นี้ ·
   *  id ที่ถูกลบจากระบบไปแล้วถูกข้ามเอง                                  */
  memberEmpIds?: string[];
  /** (rotation) คนที่ยัง "หมุนเป็นเวรหลักได้" ตามปกติ แต่ไม่ให้ถูกเลือกเป็น
   *  "คนแทน" เมื่อคนอื่นในหน้าที่นี้ลา                                    */
  substituteExcludedEmpIds?: string[];
  /** (weekly เท่านั้น) ข้ามวันอาทิตย์ — ไม่ assign หน้าที่นี้ในวันอาทิตย์ */
  skipSundays?: boolean;
  /** "ผูกขาดคนทำ" — คนที่ทำหน้าที่นี้ในวันนั้น (คนหลัก **หรือคนแทน**) จะไม่ถูก
   *  จัดหน้าที่อื่นเลยในวันเดียวกัน · default = false                     */
  exclusive?: boolean;
  rotationStartDate: string; // "YYYY-MM-DD"
  /** (rotation) "คนเริ่ม" ของรอบแรก — anchor ของ round-robin แทน hashDutyId
   *  · "" / unset / คนหลุดจาก pool → fallback hashDutyId                  */
  rotationStartEmpId?: string;
  // ─── coverage (kind="coverage") ───────────────────────────────
  /** คนที่ "ถ้าลา ต้องหาคนแทน" (เช่น พนักงานบัญชี) */
  coverageTargetEmpIds?: string[];
  /** รายชื่อคนแทน (admin เลือก · ระบบเลือกคนที่เคยแทนน้อยสุดก่อน) */
  candidateEmpIds?: string[];
  /** Primary cache — คนที่ server เลือกเป็น primary ใน period ปัจจุบัน ·
   *  pool เปลี่ยนกลาง period ไม่ recompute · server เขียนเอง           */
  cachedPrimary?: {
    periodIndex: number;
    empId: string;
  } | null;
  createdAt: number;
  updatedAt: number;
}

/* ─── useAppData return type ──────────────────────────────────── */
export interface AppData {
  allLeaves: LeaveEntry[];
  employeeDirectory: Employee[];
  storeCalendar: StoreCalendar;
  /** วันตัดรอบจ่ายของแต่ละเดือนที่ admin ปิดไปแล้ว (YYYY-MM → YYYY-MM-DD) */
  periodCutoffs: PeriodCutoffs;
  /** ยอดที่ล็อกไว้ตอนกดปิดรอบ — รอบที่ปิดแล้วใช้ตัวเลขชุดนี้ ไม่คิดสด */
  periodSnapshots: PeriodSnapshots;
  /** ตารางหน้าที่ — ทุกคน signed-in อ่านได้ · admin แก้ */
  duties: Duty[];
  dutiesLoading: boolean;
  /** หน้าที่วันนี้ + pool ของทุกหน้าที่ — Cloud Function คำนวณ (พนักงาน
   *  อ่าน employees ของคนอื่นไม่ได้ จึงคำนวณ rotation เองไม่ได้) */
  dutyAssignmentsToday: DutyAssignmentsSnapshot | null;
  loading: boolean;
  leavesLoading: boolean;
  error: Error | null;

  addLeave: (leave: Omit<LeaveEntry, "id">) => Promise<string>;
  deleteLeave: (id: string | number) => Promise<void>;
  updateEmployee: (id: string, fields: Partial<Employee>) => Promise<void>;
  upsertEmployee: (employee: Employee) => Promise<string>;
  deleteEmployee: (id: string) => Promise<void>;
  reorderEmployees: (orderedIds: string[]) => Promise<void>;
  updateStoreCalendar: (fields: Partial<StoreCalendar>) => Promise<void>;
  upsertDuty: (
    id: string | null,
    data: Omit<Duty, "id" | "createdAt" | "updatedAt">,
  ) => Promise<string>;
  deleteDuty: (id: string) => Promise<void>;
  closePayrollPeriod: (
    yearMonth: string,
    cutoffYmd: string,
    snapshot: PeriodSnapshot,
  ) => Promise<void>;
  reopenPayrollPeriod: (yearMonth: string) => Promise<void>;
  /** ล็อกยอดใหม่ทับของเดิม (วันตัดคงเดิม) — ใช้ตอนยอดสดไม่ตรงกับที่ล็อกไว้ */
  relockPayrollPeriod: (
    yearMonth: string,
    snapshot: PeriodSnapshot,
  ) => Promise<void>;
  /** ล็อกยอดจริงหลังพ้นวันที่กดปิดรอบ — เขียนทับฉบับร่างครั้งเดียว */
  finalizePayrollPeriod: (
    yearMonth: string,
    snapshot: PeriodSnapshot,
  ) => Promise<void>;
}
