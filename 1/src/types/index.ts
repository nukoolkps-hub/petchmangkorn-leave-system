/* ─── Domain types — ระบบการลา ห้างทองเพชรมังกร ────────────────── */

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

export interface LeaveType {
  id: LeaveKind;
  label: string;
  icon: string;
  color: string;
  colorLt: string;
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

/* ─── Config ที่ component อ่านจาก constants ──────────────────── */

export interface BusinessRules {
  WEEKDAY_LEAVE_QUOTA: number;
  MAX_LEAVE_DAYS_PER_REQUEST: number;
}

export interface Validation {
  LINE_USER_ID_PATTERN: RegExp;
}

/* ─── useAppData return type ──────────────────────────────────── */
export interface AppData {
  allLeaves: LeaveEntry[];
  employeeDirectory: Employee[];
  storeCalendar: StoreCalendar;
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
}
