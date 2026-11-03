/* ─── Duty rotation + substitute logic ─────────────────────────
   Pure functions — รับ input ออก output, ไม่แตะ Firestore / state

   ─── Rotation stability (A+B+C) ────────────────────────────────
   A · dutyOffset = stableSlot(duty.id) แทนตำแหน่งใน array — เพิ่ม/ลบ
       หน้าที่ตัวหนึ่งไม่กระทบ slot ของหน้าที่ตัวอื่น
   B · ฝั่ง server: ถ้า duty.cachedPrimary ตรง periodIndex ปัจจุบันและคน
       ยังอยู่ใน pool → ใช้ cache แทนคำนวณใหม่ (pool เปลี่ยนกลาง period
       ไม่กระทบ primary) — fallback ลงมาที่ A เมื่อ cache invalid
   C · ตอนสร้างพนักงานใหม่: displayOrder = max(existing)+1 → คนใหม่ต่อ
       ท้าย queue ไม่แทรกกลาง

   ─── port จากระบบเพชรทองมุกดา ─────────────────────────────────
   อัลกอริทึมเหมือนต้นทางทุกอย่าง ต่างกันแค่ 2 จุด:
   · pool = คนที่ admin เลือกใน duty.memberEmpIds (ที่นี่ไม่มีตำแหน่ง)
     · coverage target = duty.coverageTargetEmpIds
   · ตัดเรื่องเงินออกทั้งหมด (เงินค่าแทน / สิทธิ์กองกลาง)            */

import type { Duty, Employee, LeaveEntry } from "../types";
import { dateRange, toYMD } from "./dateUtils";

/** FNV-1a 32-bit hash — deterministic, no deps, low collision rate
 *  ใช้แปลง duty.id → ตัวเลขคงที่ → กลายเป็น slot ใน pool
 *  ⚠️ ต้องเหมือน functions/src/duty/dutyUtils.ts เป๊ะ (client/server compute
 *     ต้องตรงกัน) — แก้ที่นี่แล้วแก้ฝั่ง server ด้วย                       */
export function hashDutyId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0; // unsigned 32-bit
}

/** วันอาทิตย์ของวันที่ ymd ("YYYY-MM-DD") — parse แบบ local-date เลี่ยง TZ */
export function isSunday(ymd: string): boolean {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).getDay() === 0;
}

interface StoreCalendarLite {
  extraOpenSaturdays: string[];
  extraClosedWeekdays: string[];
  extraClosedSundays?: string[];
}

/** filter หน้าที่ที่ "applicable วันนี้":
 *  - ร้านปิด (เสาร์ default หรือ admin mark ปิด) → [] (ไม่มีหน้าที่)
 *  - อาทิตย์ปิดพิเศษ → [] (ไม่มีหน้าที่)
 *  - อาทิตย์เปิด → ตัด weekly+skipSundays (per-duty opt-out)
 *  - วันทำงานอื่น → ทุกหน้าที่ปกติ                                        */
export function applicableDuties(
  duties: Duty[],
  todayYmd: string,
  calendar?: StoreCalendarLite | null,
): Duty[] {
  const [y, m, d] = todayYmd.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  // เสาร์: ปิด default ยกเว้นใน extraOpenSaturdays
  if (dow === 6 && !(calendar?.extraOpenSaturdays || []).includes(todayYmd)) {
    return [];
  }
  // จันทร์-ศุกร์ ที่อยู่ใน extraClosedWeekdays → ปิดพิเศษ
  if (
    dow !== 0 &&
    dow !== 6 &&
    (calendar?.extraClosedWeekdays || []).includes(todayYmd)
  ) {
    return [];
  }
  // อาทิตย์: ปิดพิเศษ → [] · เปิด → ใช้ per-duty opt-out
  if (dow === 0) {
    if ((calendar?.extraClosedSundays || []).includes(todayYmd)) {
      return [];
    }
    return duties.filter((dt) => !(dt.period === "weekly" && dt.skipSundays));
  }
  return duties;
}

/** เลือก primary ของหน้าที่ — single source of truth ของ A+B
 *  B · cache: ถ้า periodIndex ตรง + คนยังอยู่ใน pool + ยังไม่ถูกใช้รอบนี้
 *  A · hash base + skip-collision: hashDutyId เป็น slot เริ่มต้น แล้วเลื่อน
 *      ข้ามคนที่ถูกหน้าที่อื่นจองแล้ว (used) → กระจายให้คนละคน
 *  used = คนที่เป็น primary ของหน้าที่อื่นในรอบนี้แล้ว (กัน 2 หน้าที่ทับคน)
 *  คืน null เมื่อ pool ว่าง (caller ควร guard ก่อน — นี่คือ safety net)
 *
 *  Fairness guarantee (วัดจาก simulation 52 สัปดาห์):
 *  - pool คงที่ → ทุกคนได้แต่ละหน้าที่เท่ากันเป๊ะ (หมุนครบทุก L period)
 *  - pool เปลี่ยนกลางปี → คลาดเคลื่อน ≤ ~7% ตามสัดส่วนเวลาที่อยู่จริง
 *  (ต่างจาก coverage ที่ใช้ replayCoverageHistory นับประวัติ — rotation
 *   เลือกใช้สูตร stateless เพื่อความนิ่ง/คาดเดาได้ ยอมแลก fairness ส่วนน้อย) */
export function pickPrimary(
  duty: Duty,
  pool: string[],
  periodIdx: number,
  used: Set<string>,
  groupOffset?: number,
): string | null {
  if (pool.length === 0) return null; // กัน % 0 = NaN
  const cache = duty.cachedPrimary;
  if (
    cache &&
    cache.periodIndex === periodIdx &&
    pool.includes(cache.empId) &&
    !used.has(cache.empId)
  ) {
    return cache.empId;
  }
  // anchor (ลำดับความสำคัญ):
  //  1) ตำแหน่ง "คนเริ่ม" ที่ admin เลือก (rotationStartEmpId) ใน pool ปัจจุบัน
  //  2) groupOffset — offset ประจำกลุ่ม pool (0,1,2,... จาก assignPrimaries)
  //     ทำให้หน้าที่ pool เดียวกัน base ไม่ชนกัน = Latin square → แต่ละหน้าที่
  //     วนครบทุกคนก่อนซ้ำ (กันคนซ้ำในเดือนเดียว)
  //  3) fallback hashDutyId — standalone/monthly (พฤติกรรมเดิม · backward compat)
  const startIdx = duty.rotationStartEmpId
    ? pool.indexOf(duty.rotationStartEmpId)
    : -1;
  const anchor =
    startIdx >= 0 ? startIdx : (groupOffset ?? hashDutyId(duty.id));
  const base = (periodIdx + anchor) % pool.length;
  for (let off = 0; off < pool.length; off++) {
    const cand = pool[(base + off) % pool.length];
    if (!used.has(cand)) return cand;
  }
  return pool[base]; // ทุกคนถูกใช้หมด → ยอมซ้ำ (หน้าที่ > คน)
}

/** assign primary ให้หน้าที่กลุ่มหนึ่ง (Phase 1 = monthly, Phase 2 = weekly)
 *  — ลูปเดียวใช้ร่วม 2 phase:
 *  - pool ของแต่ละหน้าที่ = poolOf(duty) − locked (fallback pool เต็มถ้าว่าง)
 *  - lockPicked: monthly เพิ่มคนที่เลือกเข้า locked (กันออกจาก weekly)
 *  ผล: เขียนเพิ่มลง out + assigned (skip-collision ข้ามหน้าที่)            */
function assignPrimaries(
  duties: Duty[],
  todayYmd: string,
  poolOf: (duty: Duty) => string[],
  assigned: Set<string>,
  locked: Set<string>,
  lockPicked: boolean,
  out: Map<string, string>,
): void {
  // groupSeq: pool signature → จำนวนหน้าที่ weekly ที่ pool เดียวกันซึ่ง assign
  // ไปแล้ว → ใช้เป็น offset เรียง 0,1,2,... (Latin square) ให้ base ไม่ชนกัน ·
  // monthly คง hashDutyId (มักตัวเดียวต่อ pool + คง consistency กับ
  // replayRotationSubHistory ที่คำนวณ primary รายเดือนแบบ standalone)
  const groupSeq = new Map<string, number>();
  for (const duty of duties) {
    const fullPool = poolOf(duty);
    if (fullPool.length === 0) continue;
    const remaining = fullPool.filter((id) => !locked.has(id));
    const pool = remaining.length > 0 ? remaining : fullPool;
    let groupOffset: number | undefined;
    if (duty.period === "weekly") {
      const key = pool.join(",");
      groupOffset = groupSeq.get(key) ?? 0;
      groupSeq.set(key, groupOffset + 1);
    }
    const idx = Math.max(0, getPeriodIndex(duty, todayYmd));
    const primary = pickPrimary(duty, pool, idx, assigned, groupOffset);
    if (!primary) continue;
    assigned.add(primary);
    if (lockPicked) locked.add(primary);
    out.set(duty.id, primary);
  }
}

export interface DutyAssignment {
  dutyId: string;
  dutyName: string;
  period: "weekly" | "monthly";
  primaryEmpId: string | null; // คนที่ระบบกำหนดให้ตาม rotation (ก่อนเช็ค leave)
  actualEmpId: string | null; // คนที่ทำจริงในวันนั้น (= primary ถ้าไม่ลา / substitute ถ้าลา)
  reason:
    | "rotation"
    | "substitute_for_leave"
    | "double_up"
    | "all_on_leave"
    | "empty_pool";
  /** คนหลักไม่ได้ลา แต่ "ติดหน้าที่ผูกขาด" อื่นวันนี้ → มีคนมาแทน
   *  (UI เขียน "แทน X (ติดหน้าที่อื่น)" แทน "(ลา)") · undefined = ของเดิม */
  primaryPulledToDuty?: boolean;
  periodStart: string; // "YYYY-MM-DD"
  periodEnd: string;
}

/** วันห่างระหว่าง 2 วัน (calendar days, ไม่ใช่ 24h × ms) */
function daysBetween(startYmd: string, todayYmd: string): number {
  const a = new Date(`${startYmd}T00:00:00`);
  const b = new Date(`${todayYmd}T00:00:00`);
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

/** เดือนห่างตามปฏิทิน (Jan→Feb = 1) */
function monthsBetween(startYmd: string, todayYmd: string): number {
  const a = new Date(`${startYmd}T00:00:00`);
  const b = new Date(`${todayYmd}T00:00:00`);
  return (
    (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
  );
}

/** คำนวณ period index ของวันที่ X — index 0 = period แรก (วันที่
 *  rotationStartDate), index 1 = period ที่ 2, ฯลฯ */
export function getPeriodIndex(duty: Duty, todayYmd: string): number {
  if (duty.period === "weekly") {
    return Math.floor(daysBetween(duty.rotationStartDate, todayYmd) / 7);
  }
  return monthsBetween(duty.rotationStartDate, todayYmd);
}

/** ช่วงของ period index ที่ระบุ — index 0 = period แรก (rotationStartDate) */
export function getPeriodRangeForIndex(
  duty: Duty,
  idx: number,
): { start: string; end: string } {
  const safeIdx = Math.max(0, idx);
  const start = new Date(`${duty.rotationStartDate}T00:00:00`);
  if (duty.period === "weekly") {
    start.setDate(start.getDate() + safeIdx * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { start: toYMD(start), end: toYMD(end) };
  }
  start.setMonth(start.getMonth() + safeIdx);
  start.setDate(1);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  end.setDate(0); // last day of period month
  return { start: toYMD(start), end: toYMD(end) };
}

/** ช่วงของ period ที่ today อยู่ใน — สำหรับแสดง "สัปดาห์นี้ X – Y" */
export function getPeriodRange(
  duty: Duty,
  todayYmd: string,
): { start: string; end: string } {
  return getPeriodRangeForIndex(duty, getPeriodIndex(duty, todayYmd));
}

/** ลาวันนั้นไหม — leave.start ≤ ymd ≤ leave.end (string compare) */
function isOnLeave(leaves: LeaveEntry[], empId: string, ymd: string): boolean {
  return leaves.some(
    (l) => l.employeeId === empId && l.start <= ymd && l.end >= ymd,
  );
}

/** Resolve pool — คนที่ admin เลือกไว้ใน duty.memberEmpIds เรียงตาม
 *  displayOrder (asc) → ชื่อ (asc) เป็น fallback · id ที่ถูกลบจากระบบ
 *  ไปแล้วไม่อยู่ใน employees → ข้ามเอง · ลำดับ deterministic — ปรับด้วย
 *  admin ลากเรียงที่หน้า "พนักงาน" (displayOrder) ไม่ใช่ลำดับใน array
 *
 *  public — UI อื่นๆ (DutyEditModal) ก็ใช้ตัวนี้เพื่อแสดงลำดับ pool
 *  จะได้ตรงกับ rotation จริงเสมอ (single source of truth)
 *  ⚠️ ต้องเหมือน functions/src/duty/dutyUtils.ts (check-duty-sync)       */
export function resolveDutyPool(duty: Duty, employees: Employee[]): Employee[] {
  const members = new Set(duty.memberEmpIds || []);
  return sortByDisplayOrder(employees.filter((e) => members.has(e.id)));
}

/** เรียงพนักงานตาม displayOrder (asc) → ชื่อ (fallback) — ลำดับของ pool
 *  ⚠️ ต้องเหมือน functions/src/duty/dutyUtils.ts (check-duty-sync)       */
export function sortByDisplayOrder<T extends EmployeeOrderLite>(
  employees: T[],
): T[] {
  return [...employees].sort((a, b) => {
    const ao = typeof a.displayOrder === "number" ? a.displayOrder : null;
    const bo = typeof b.displayOrder === "number" ? b.displayOrder : null;
    if (ao !== null && bo !== null) return ao - bo;
    if (ao !== null) return -1;
    if (bo !== null) return 1;
    return (a.name || "").localeCompare(b.name || "", "th");
  });
}

interface EmployeeOrderLite {
  name?: string;
  displayOrder?: number | null;
}

function activePool(duty: Duty, employees: Employee[]): string[] {
  return resolveDutyPool(duty, employees).map((e) => e.id);
}

/** คำนวณ assignment ของหน้าที่เดียวในวันเดียว
 *  excludeForPrimary: ID ของคนที่ "ไม่ให้เป็น primary" (เช่น คนที่ทำ
 *    monthly แล้ว — แยกออกจาก weekly)
 *  primariesToday: ใช้ exclude ตอนหา substitute ("ไม่ทับคนอื่น")
 *
 *  Algorithm:
 *  - pool พรีเฟอเรนซ์ = activePool − excludeForPrimary
 *  - ถ้า pool เหลือ 0 → fallback ใช้ activePool ทั้งหมด (ห้ามให้มีหน้าที่ว่าง)
 *  - primary มาจาก precomputedPrimary (Phase 1/2 ที่ de-collide แล้ว) —
 *    ถ้าไม่ส่งมา (standalone) compute เองผ่าน pickPrimary                   */
/** เลือกคนที่ "ถือหน้าที่วันนี้น้อยสุด" จากรายชื่อที่สแกนมาแล้ว —
 *  เสมอกันใช้ลำดับสแกนเดิม (deterministic) · load ว่าง = พฤติกรรมเดิมเป๊ะ */
function pickLeastLoaded(
  candidates: string[],
  loadToday?: Map<string, number>,
): string | null {
  if (candidates.length === 0) return null;
  if (!loadToday) return candidates[0];
  let best = candidates[0];
  let bestLoad = loadToday.get(best) ?? 0;
  for (const cand of candidates.slice(1)) {
    const load = loadToday.get(cand) ?? 0;
    if (load < bestLoad) {
      best = cand;
      bestLoad = load;
    }
  }
  return best;
}

export function computeDutyForDay(
  duty: Duty,
  todayYmd: string,
  employees: Employee[],
  leaves: LeaveEntry[],
  excludeForPrimary: Set<string>,
  primariesToday: Set<string>,
  precomputedPrimary?: string,
  /** คนที่ "ติดหน้าที่ผูกขาด" วันนี้ (Duty.exclusive) — กันออกจากหน้าที่นี้
   *  ทุกชั้น (คนหลัก · คนแทน · double-up) · แต่ยังเป็นแค่ preference:
   *  ถ้ากันแล้วไม่มีใครทำได้เลย จะยอมดึงกลับมา (ห้ามปล่อยหน้าที่ว่าง)     */
  blockedEmpIds?: Set<string>,
  /** จำนวนหน้าที่ที่แต่ละคน "ถืออยู่แล้ววันนี้" — ใช้ตอนจำเป็นต้องให้ทำซ้อน
   *  (double_up / ทางเลือกสุดท้าย) เลือกคนที่ถือน้อยสุดก่อน กันงานไปกอง
   *  ที่คนเดียว · ไม่ส่ง = ทุกคนถือ 0 (พฤติกรรมเดิม: เจอใครก่อนเอาคนนั้น) */
  loadToday?: Map<string, number>,
): DutyAssignment {
  // rawPool = คนทั้งหมดของหน้าที่นี้ (ยังไม่กรองอะไร) — เก็บไว้ใช้เป็น
  // "ทางเลือกสุดท้าย" กันหน้าที่ว่างทั้งที่ยังมีคนมาทำงานวันนี้
  const rawPool = activePool(duty, employees);
  const unblocked = blockedEmpIds?.size
    ? rawPool.filter((id) => !blockedEmpIds.has(id))
    : rawPool;
  const fullPool = unblocked.length > 0 ? unblocked : rawPool;
  const { start: periodStart, end: periodEnd } = getPeriodRange(duty, todayYmd);

  if (fullPool.length === 0) {
    return {
      dutyId: duty.id,
      dutyName: duty.name,
      period: duty.period,
      primaryEmpId: null,
      actualEmpId: null,
      reason: "empty_pool",
      periodStart,
      periodEnd,
    };
  }

  // pool พรีเฟอเรนซ์ — exclude คนที่ "ห้ามเป็น primary" (เช่น monthly lock)
  // ถ้า exclude ทำให้ pool ว่าง → fallback ใช้ pool เต็ม (กันหน้าที่ว่าง)
  const preferredPool = fullPool.filter((id) => !excludeForPrimary.has(id));
  const pool = preferredPool.length > 0 ? preferredPool : fullPool;

  const idx = Math.max(0, getPeriodIndex(duty, todayYmd));
  // คนหลักที่ "ติดหน้าที่ผูกขาด" วันนี้ ไม่ได้แปลว่าเวรเปลี่ยนมือ — เขายัง
  // เป็นคนหลักของรอบนี้ แค่วันนี้มาทำไม่ได้ · ต้องคงเขาไว้เป็น primaryEmpId
  // แล้วหา "คนแทน" เหมือนตอนลา ไม่งั้นพัง 2 อย่าง:
  //  1. UI ไม่ขึ้น "แทน X" — ดูเหมือนเป็นเวรของคนแทนเอง
  //  2. rotation เลื่อน — ตัดเขาออกจาก pool ทำให้ index ของทุกคนขยับ
  //     (คนถัดไปโดนข้าม · คนหลักตัวจริงไม่เคยถูกบันทึกว่าถึงเวร)
  const blockedPrimary =
    !!precomputedPrimary &&
    !!blockedEmpIds?.has(precomputedPrimary) &&
    rawPool.includes(precomputedPrimary);
  // ใช้ primary ที่ Phase 1/2 คำนวณไว้ (de-collide แล้ว) ถ้ายังอยู่ใน pool
  // ปัจจุบัน · ไม่งั้น compute เอง — ใช้ primariesToday เป็น used set เพื่อ
  // เคารพ skip-collision (ไม่ทับ primary ของหน้าที่อื่น) แม้ใน fallback
  const primary = blockedPrimary
    ? (precomputedPrimary as string)
    : precomputedPrimary && pool.includes(precomputedPrimary)
      ? precomputedPrimary
      : pickPrimary(duty, pool, idx, primariesToday);
  if (!primary) {
    // pool ว่างหลัง filter ทุกชั้น (ไม่ควรถึง — fullPool guard ด้านบน)
    return {
      dutyId: duty.id,
      dutyName: duty.name,
      period: duty.period,
      primaryEmpId: null,
      actualEmpId: null,
      reason: "empty_pool",
      periodStart,
      periodEnd,
    };
  }

  // primary ไม่ลา + ไม่ติดหน้าที่ผูกขาด → ใช้ primary
  if (!blockedPrimary && !isOnLeave(leaves, primary, todayYmd)) {
    return {
      dutyId: duty.id,
      dutyName: duty.name,
      period: duty.period,
      primaryEmpId: primary,
      actualEmpId: primary,
      reason: "rotation",
      periodStart,
      periodEnd,
    };
  }

  // admin ตั้ง "ไม่ให้เป็นคนแทน" ในหน้าที่นี้ (ยังหมุนเป็นเวรหลักได้ตามปกติ) —
  // ต้องข้ามทั้ง 2 pass ให้ตรงกับ server (computeDutyForDay) + forecast
  // (pickForecastSubstitute/pickRotationSubstitute) ที่เคารพค่านี้อยู่แล้ว
  const subExcluded = new Set(duty.substituteExcludedEmpIds || []);

  // primary ลา/ติดหน้าที่ผูกขาด → หา substitute (ข้ามคนที่ติดหน้าที่อื่น +
  // ข้ามคนที่ลา + ข้ามคนที่ admin ตั้งไม่ให้เป็นคนแทน) · scan เริ่มจากตำแหน่ง
  // primary ใน pool (deterministic) · ถ้า primary ไม่อยู่ใน pool (ติดผูกขาด
  // เลยถูกกรองออก) เริ่มที่ offset 0 ไม่งั้นคนแรกของ pool จะถูกข้ามฟรีๆ
  const primaryIdx = pool.indexOf(primary);
  const startIdx = Math.max(0, primaryIdx);
  const firstOffset = primaryIdx >= 0 ? 1 : 0;
  for (let offset = firstOffset; offset < pool.length; offset++) {
    const cand = pool[(startIdx + offset) % pool.length];
    if (cand === primary) continue;
    if (subExcluded.has(cand)) continue;
    if (isOnLeave(leaves, cand, todayYmd)) continue;
    if (primariesToday.has(cand)) continue; // ไม่ทับหน้าที่อื่น
    return {
      dutyId: duty.id,
      dutyName: duty.name,
      period: duty.period,
      primaryEmpId: primary,
      actualEmpId: cand,
      reason: "substitute_for_leave",
      primaryPulledToDuty: blockedPrimary || undefined,
      periodStart,
      periodEnd,
    };
  }

  // fallback: ทุกคนใน pool ติดหน้าที่อื่น → ใช้ใครก็ได้ใน pool ที่ไม่ลา
  // (double up — ยังไม่ออกไป fullPool ตามกฎ monthly แยก · ยังข้าม subExcluded)
  const doubleUpCands: string[] = [];
  for (let offset = firstOffset; offset < pool.length; offset++) {
    const cand = pool[(startIdx + offset) % pool.length];
    if (cand === primary) continue;
    if (subExcluded.has(cand)) continue;
    if (isOnLeave(leaves, cand, todayYmd)) continue;
    doubleUpCands.push(cand);
  }
  const doubleUp = pickLeastLoaded(doubleUpCands, loadToday);
  if (doubleUp) {
    return {
      dutyId: duty.id,
      dutyName: duty.name,
      period: duty.period,
      primaryEmpId: primary,
      actualEmpId: doubleUp,
      reason: "double_up",
      primaryPulledToDuty: blockedPrimary || undefined,
      periodStart,
      periodEnd,
    };
  }

  // ทางเลือกสุดท้าย — ห้ามปล่อยหน้าที่ว่างถ้ายังมีคนมาทำงานวันนี้
  // ปลดทั้ง excludeForPrimary (คนหลักรายเดือน) และ blockedEmpIds (คนผูกขาด)
  // แล้วมองจาก rawPool · ยังเคารพ subExcluded (admin สั่งห้ามเป็นคนแทน) และ
  // ข้ามคนที่ลาจริง — เคสนี้เกิดตอนคนมาทำงานน้อยกว่าจำนวนหน้าที่
  const rawStartIdx = Math.max(0, rawPool.indexOf(primary));
  const lastResortCands: string[] = [];
  for (let offset = 1; offset <= rawPool.length; offset++) {
    const cand = rawPool[(rawStartIdx + offset) % rawPool.length];
    if (cand === primary) continue;
    if (subExcluded.has(cand)) continue;
    if (isOnLeave(leaves, cand, todayYmd)) continue;
    if (!lastResortCands.includes(cand)) lastResortCands.push(cand);
  }
  const lastResort = pickLeastLoaded(lastResortCands, loadToday);
  if (lastResort) {
    return {
      dutyId: duty.id,
      dutyName: duty.name,
      period: duty.period,
      primaryEmpId: primary,
      actualEmpId: lastResort,
      reason: "double_up",
      primaryPulledToDuty: blockedPrimary || undefined,
      periodStart,
      periodEnd,
    };
  }

  // คนหลักติดหน้าที่ผูกขาด แต่ไม่มีใครมาแทนได้เลย → ให้เขาทำซ้อนเอง
  // (ผูกขาดเป็นแค่ preference · "ห้ามปล่อยหน้าที่ว่าง" สำคัญกว่า)
  if (blockedPrimary) {
    return {
      dutyId: duty.id,
      dutyName: duty.name,
      period: duty.period,
      primaryEmpId: primary,
      actualEmpId: primary,
      reason: "rotation",
      periodStart,
      periodEnd,
    };
  }

  // ทุกคนของหน้าที่นี้ลาหมดจริงๆ
  return {
    dutyId: duty.id,
    dutyName: duty.name,
    period: duty.period,
    primaryEmpId: primary,
    actualEmpId: null,
    reason: "all_on_leave",
    periodStart,
    periodEnd,
  };
}

/** คำนวณทุกหน้าที่ในวันเดียว
 *
 *  Strategy:
 *  1. Phase 1 — assign monthly primaries ก่อน (จะ "lock" คนเหล่านี้
 *     ทั้งเดือน → ไม่เข้าใน weekly duty)
 *  2. Phase 2 — assign weekly primaries จาก pool ที่เหลือ (ไม่ทับ monthly)
 *  3. Phase 3 — compute actual (substitute ถ้า primary ลา) — ใช้
 *     primariesToday set กัน "ทับ"
 *
 *  Offset ของหน้าที่ weekly ที่ pool เดียวกัน = ลำดับ 0,1,2,... (Latin square
 *  → base ไม่ชนกัน · แต่ละหน้าที่วนครบทุกคนก่อนซ้ำ) · monthly + standalone
 *  ยังใช้ hashDutyId(duty.id) เดิม
 *
 *  ⚠️ assign primary จาก "หน้าที่ทั้งหมด" (ก่อน filter ปฏิทิน) เสมอ — groupOffset
 *  (Latin square) + skip-collision ขึ้นกับ "ลำดับหน้าที่ใน array" ถ้าใช้เฉพาะ
 *  หน้าที่ที่ทำวันนั้น หน้าที่ weekly+skipSundays ที่หายไปวันอาทิตย์จะทำให้
 *  offset ของหน้าที่ที่เหลือเลื่อนทั้งแถว → คนหลักเปลี่ยนคนกลางสัปดาห์ +
 *  ไม่ตรงกับปฏิทินหน้าที่ (computeDutyForecast ไม่ filter รายวัน) · filter
 *  เฉพาะตอน output                                                          */
export function computeAllDutiesForDay(
  duties: Duty[],
  todayYmd: string,
  employees: Employee[],
  leaves: LeaveEntry[],
  calendar?: StoreCalendarLite | null,
): DutyAssignment[] {
  // ร้านปิด → ไม่มีหน้าที่ · อาทิตย์ → ตัด weekly+skipSundays per duty
  const todayDuties = applicableDuties(duties, todayYmd, calendar);
  // คนหลักคิดจากรายการเต็ม (ไม่ขึ้นกับว่าวันนั้นหน้าที่ไหนถูกตัด)
  const monthlyDuties = duties.filter((d) => d.period === "monthly");
  const weeklyDuties = duties.filter((d) => d.period === "weekly");

  // assigned = คนที่เป็น primary แล้วในรอบนี้ — pickPrimary ใช้ skip-collision
  // (2 หน้าที่ pool เดียวกัน → คนละคน) · lockedByMonthly = monthly กันออก weekly
  const assigned = new Set<string>();
  const lockedByMonthly = new Set<string>();
  const primaryByDuty = new Map<string, string>(); // dutyId → empId
  const poolOf = (duty: Duty) => activePool(duty, employees);

  // Phase 1: monthly (assign ก่อน + lock) · Phase 2: weekly (exclude locked)
  assignPrimaries(
    monthlyDuties,
    todayYmd,
    poolOf,
    assigned,
    lockedByMonthly,
    true,
    primaryByDuty,
  );
  assignPrimaries(
    weeklyDuties,
    todayYmd,
    poolOf,
    assigned,
    lockedByMonthly,
    false,
    primaryByDuty,
  );

  // primariesToday = primary ทั้งหมด (de-collide แล้ว) — substitute "ไม่ทับ"
  const primariesToday = new Set<string>(primaryByDuty.values());

  // Phase 3: compute actual — ใช้ todayDuties (กรองแล้ว) เพื่อให้ Sunday-off
  // ไม่โผล่ใน assignment array
  //
  // ⚠️ แบ่ง 2 รอบเพราะหน้าที่ "ผูกขาด" (Duty.exclusive) ต้องรู้ผลก่อน:
  // 3a คำนวณหน้าที่ผูกขาดก่อน → ได้ "คนที่ทำจริง" (คนหลัก **หรือคนแทน**)
  // 3b หน้าที่ที่เหลือคำนวณโดยตัดคนเหล่านั้นออกจาก pool → งานที่เคยตกเป็นของ
  //    เขากระจายไปให้คนอื่น · ต้องดูคนทำจริงไม่ใช่คนหลัก เพราะเคสที่เจอคือ
  //    คนที่ "มาแทน" หน้าที่ผูกขาด แล้วยังถูกจัดหน้าที่อื่นซ้อน
  const exclusiveWorkers = new Set<string>();
  const resultByDutyId = new Map<string, DutyAssignment>();
  // งานที่แต่ละคนถืออยู่แล้ววันนี้ — ใช้ตอนจำเป็นต้องให้ทำซ้อน จะได้เลือก
  // คนที่ถือน้อยสุด แทนที่จะเทให้คนแรกที่เจอ
  const loadToday = new Map<string, number>();
  const runDuty = (duty: Duty, blocked?: Set<string>) =>
    computeDutyForDay(
      duty,
      todayYmd,
      employees,
      leaves,
      duty.period === "monthly" ? new Set<string>() : lockedByMonthly,
      primariesToday,
      primaryByDuty.get(duty.id),
      blocked,
      loadToday,
    );
  const record = (duty: Duty, assignment: DutyAssignment) => {
    resultByDutyId.set(duty.id, assignment);
    if (assignment.actualEmpId) {
      loadToday.set(
        assignment.actualEmpId,
        (loadToday.get(assignment.actualEmpId) ?? 0) + 1,
      );
    }
  };

  // 3a — หน้าที่ผูกขาด (สะสมทีละตัว: ผูกขาดตัวที่ 2 ต้องไม่ได้คนเดียวกับตัวแรก)
  for (const duty of todayDuties.filter((d) => d.exclusive)) {
    const assignment = runDuty(duty, new Set(exclusiveWorkers));
    record(duty, assignment);
    if (assignment.actualEmpId) exclusiveWorkers.add(assignment.actualEmpId);
  }

  // 3b — หน้าที่ที่เหลือ
  for (const duty of todayDuties.filter((d) => !d.exclusive)) {
    record(duty, runDuty(duty, exclusiveWorkers));
  }

  // คืนตามลำดับ todayDuties เดิม (UI เรียงตามลำดับที่ admin ตั้งไว้)
  return todayDuties.map(
    (duty) => resultByDutyId.get(duty.id) as DutyAssignment,
  );
}

/* ─── Coverage helpers (เวรแทนคนลา) ───────────────────────────────
   replay logic เดียวกับ server (functions/duty/dutyUtils) เพื่อให้นับตรงกัน */

/** monthly primaries ของวันใดๆ — ใช้ assignPrimaries ตัวเดียวกับ
 *  computeAllDutiesForDay (cache + hash + de-collide) เพื่อให้ผลตรงกัน
 *  ⚠️ ต้องเหมือน functions/src/duty/dutyUtils.ts เป๊ะ                    */
export function monthlyPrimariesForDay(
  monthlyDuties: Duty[],
  todayYmd: string,
  employees: Employee[],
): Set<string> {
  if (monthlyDuties.length === 0) return new Set();
  const assigned = new Set<string>();
  const locked = new Set<string>();
  const out = new Map<string, string>();
  assignPrimaries(
    monthlyDuties,
    todayYmd,
    (d) => activePool(d, employees),
    assigned,
    locked,
    true,
    out,
  );
  return new Set(out.values());
}

function pickCoverageCandidate(
  duty: Duty,
  todayYmd: string,
  employees: Employee[],
  leaves: LeaveEntry[],
  history: Map<string, number>,
  usedToday: Set<string>,
  monthlyPrimaries: Set<string>,
): string | null {
  const byId = new Map(employees.map((e) => [e.id, e]));
  const eligible = (duty.candidateEmpIds || [])
    .map((id) => byId.get(id))
    .filter(
      (e): e is Employee =>
        !!e &&
        !usedToday.has(e.id) &&
        !monthlyPrimaries.has(e.id) &&
        !isOnLeave(leaves, e.id, todayYmd),
    )
    .sort((a, b) => {
      const ca = history.get(a.id) || 0;
      const cb = history.get(b.id) || 0;
      if (ca !== cb) return ca - cb;
      const ao = typeof a.displayOrder === "number" ? a.displayOrder : 1e9;
      const bo = typeof b.displayOrder === "number" ? b.displayOrder : 1e9;
      if (ao !== bo) return ao - bo;
      return (a.name || "").localeCompare(b.name || "", "th");
    });
  return eligible.length > 0 ? eligible[0].id : null;
}

function dutyAbsentTargets(
  duty: Duty,
  todayYmd: string,
  employees: Employee[],
  leaves: LeaveEntry[],
): string[] {
  const targets = new Set(duty.coverageTargetEmpIds || []);
  return employees
    .filter((e) => targets.has(e.id) && isOnLeave(leaves, e.id, todayYmd))
    .sort(
      (a, b) =>
        (typeof a.displayOrder === "number" ? a.displayOrder : 1e9) -
        (typeof b.displayOrder === "number" ? b.displayOrder : 1e9),
    )
    .map((e) => e.id);
}

/** การเข้าไปแทน ต่อคน — วัน (รายวัน) + แยกตาม "คนที่ถูกแทน" (target) */
export interface SubstituteCount {
  /** จำนวนวันที่ไปแทนรวม (ทุก target) */
  days: number;
  /** วันที่ไปแทน แยกตามคนที่ถูกแทน — targetEmpId → จำนวนวัน (แทนใคร กี่วัน) */
  byTarget: Map<string, number>;
  /** **วันไหนบ้าง** (YYYY-MM-DD เรียงเก่า→ใหม่) แยกตามคนที่ถูกแทน — UI กาง
   *  ดูรายวันได้ · จำนวนใน `byTarget` มาจากความยาวของ array นี้เสมอ
   *  (เขียนพร้อมกันที่เดียว จึงไม่มีทางหลุดจากกัน) */
  datesByTarget: Map<string, string[]>;
}

/** กิจกรรมรายวันของ 1 duty */
export interface DutyDayActivity {
  /** วันที่คนนี้เป็น "คนหลัก" และอยู่ทำจริง (ร้านเปิด + ไม่ลา) — นับรายวัน
   *  (ใช้กับหน้าที่หมุนเวียนรายสัปดาห์ · รายเดือนแสดงเป็น "เดือน" จาก
   *  computeDutyCounts แทน) · Map(empId → จำนวนวัน) */
  primaryDays: Map<string, number>;
  /** การเข้าไปแทน (rotation ตอน primary ลา + coverage) · Map(empId → {วัน, แทนใคร}) */
  substitute: Map<string, SubstituteCount>;
}

/** สรุปกิจกรรมต่อ duty ในช่วง [fromYmd, toYmd] (เฉพาะที่ทำแล้ว)
 *  - rotation (คนหลัก + คนแทน): คิดแบบ "รอบ" (period) เหมือนมุมมองย้อนหลัง
 *    (computeDutyHistory/computeDutyCounts) — คนหลักของรอบคำนวณครั้งเดียวที่ต้น
 *    รอบด้วย computeForecastPrimaries → เลขคนหลักตรงกับย้อนหลังเป๊ะ · ไม่ flicker
 *    กลางสัปดาห์ตอนข้ามเดือน (de-collision รายวันของ computeAllDutiesForDay
 *    เคยทำให้คนหลัก weekly สลับกลางสัปดาห์ → โผล่คนที่ย้อนหลังไม่มี)
 *  - คนหลักอยู่ทำ (ไม่ลา + ร้านเปิด) = +1 วัน · คนหลักลา → คนแทน (target = คนหลัก) ·
 *    monthly เลือกคนแทนแบบยุติธรรม "เคยแทนน้อยสุดก่อน" (pickRotationSubstitute)
 *    ให้ตรงกับ assignment จริง/แท็บล่วงหน้า · weekly = neighbor-scan เดิม
 *  - coverage: replay รายวันจากใบลาจริง (เลือกคนแทนยุติธรรม) · ต้องมี employees
 *  รับ pool ที่ resolve แล้ว (poolByDutyId) — ทั้ง admin/พนักงานคำนวณ rotation ได้
 *  เองจาก snapshot dutyPools โดยไม่ต้องอ่าน employees ของคนอื่น
 *  ⚠️ คำนวณจากสูตร + ใบลาจริง (ไม่ใช่ log จริง) · ตัวคนแทน rotation อาจคลาด
 *  เล็กน้อย (overview) — แต่ target/จำนวนวันของคนหลักตรงกับย้อนหลัง               */
export function computeDutyDayActivity(
  duties: Duty[],
  poolByDutyId: Map<string, string[]>,
  allLeaves: LeaveEntry[],
  calendar: StoreCalendarLite | null | undefined,
  fromYmd: string,
  toYmd: string,
  // employees ต้องมีเฉพาะตอนนับ coverage duty (แทนคนลาของกลุ่มเป้าหมาย) —
  // ฝั่งพนักงานไม่มี employees แต่มี poolByDutyId (snapshot) → rotation ยังนับได้
  employees?: Employee[],
): Map<string, DutyDayActivity> {
  const result = new Map<string, DutyDayActivity>();
  if (fromYmd > toYmd) return result;
  const rotationDuties = duties.filter((d) => d.kind !== "coverage");
  const coverageDuties = duties.filter((d) => d.kind === "coverage");
  const yearStart = `${fromYmd.slice(0, 4)}-01-01`;
  const ensure = (dutyId: string): DutyDayActivity => {
    let a = result.get(dutyId);
    if (!a) {
      a = { primaryDays: new Map(), substitute: new Map() };
      result.set(dutyId, a);
    }
    return a;
  };
  const bumpPrimary = (dutyId: string, empId: string) => {
    const a = ensure(dutyId);
    a.primaryDays.set(empId, (a.primaryDays.get(empId) || 0) + 1);
  };
  // คนแทน (empId) ไปแทน target (คนที่ลา/คนหลักที่ลา) วันไหนบ้าง
  // — เก็บ "วันที่" เป็นหลัก แล้วให้ `byTarget` = ความยาวของลิสต์วัน
  // (นับแยกกันคนละที่เมื่อไหร่ เลขกับรายวันจะไม่ตรงกันโดยไม่มีอะไรฟ้อง)
  const bumpSub = (
    dutyId: string,
    empId: string,
    targetId: string,
    ymd: string,
  ) => {
    const a = ensure(dutyId);
    const cur = a.substitute.get(empId) || {
      days: 0,
      byTarget: new Map(),
      datesByTarget: new Map(),
    };
    cur.days += 1;
    const dates = cur.datesByTarget.get(targetId) || [];
    dates.push(ymd);
    cur.datesByTarget.set(targetId, dates);
    cur.byTarget.set(targetId, dates.length);
    a.substitute.set(empId, cur);
  };

  // ── rotation: คนหลัก + คนแทน คิดแบบรอบ (ตรงกับย้อนหลัง) ──────────────
  // pool = snapshot dutyPools (resolve แล้ว) · คนหลักของรอบ =
  // computeForecastPrimaries ณ ต้นรอบ (memoize ตามวัน)
  if (rotationDuties.length > 0) {
    // dutyId ของหน้าที่รายเดือน — ใช้กันคนหลักรายเดือนออกจาก pool คนแทนรายสัปดาห์
    const monthlyDutyIds = new Set(
      rotationDuties.filter((d) => d.period === "monthly").map((d) => d.id),
    );
    const primCache = new Map<string, Map<string, string | null>>();
    const primariesAt = (ymd: string) => {
      let m = primCache.get(ymd);
      if (!m) {
        m = computeForecastPrimaries(rotationDuties, poolByDutyId, ymd);
        primCache.set(ymd, m);
      }
      return m;
    };
    for (const duty of rotationDuties) {
      const pool = poolByDutyId.get(duty.id) || [];
      if (pool.length === 0) continue;
      const subExcluded = new Set(duty.substituteExcludedEmpIds || []);
      // คนแทน (weekly + monthly) เลือกแบบยุติธรรม "เคยแทนน้อยสุดก่อน" (ตรงกับ
      // assignment จริง) — seed history ต้นปี→fromYmd (ว่างเมื่อ fromYmd = ต้นปี)
      // แล้วนับเพิ่มระหว่างเดินวัน · history ว่าง → tie-break ตามลำดับ (= neighbor เดิม)
      const subHistory = replayRotationSubHistory(
        duty,
        pool,
        allLeaves,
        calendar,
        yearStart,
        fromYmd,
      );
      // เดินทีละรอบ (idx 0 = รอบแรก ณ rotationStartDate) → ไม่นับวันก่อนเริ่มหมุน
      const currentIdx = Math.max(0, getPeriodIndex(duty, toYmd));
      for (let idx = 0; idx <= currentIdx; idx++) {
        const range = getPeriodRangeForIndex(duty, idx);
        if (range.end < fromYmd) continue;
        if (range.start > toYmd) break;
        const primaries = primariesAt(range.start);
        const primary = primaries.get(duty.id);
        if (!primary) continue;
        const primariesThisPeriod = new Set<string>();
        // คนหลักรายเดือนของรอบนี้ — กันออกจาก pool คนแทนรายสัปดาห์
        const monthlyPrimariesThisPeriod = new Set<string>();
        for (const [dId, v] of primaries) {
          if (!v) continue;
          primariesThisPeriod.add(v);
          if (monthlyDutyIds.has(dId)) monthlyPrimariesThisPeriod.add(v);
        }
        // pool คนแทน — weekly ตัดคนหลักรายเดือนออก (fallback pool เต็มถ้าว่าง)
        const reduced =
          duty.period === "weekly"
            ? pool.filter((id) => !monthlyPrimariesThisPeriod.has(id))
            : pool;
        const subPool = reduced.length > 0 ? reduced : pool;
        const dayStart = range.start < fromYmd ? fromYmd : range.start;
        const dayEnd = range.end > toYmd ? toYmd : range.end;
        for (const d of dateRange(dayStart, dayEnd)) {
          // ร้านปิดวันนั้น (เสาร์ default / admin mark) → ไม่นับ · เปิดพิเศษ → นับ
          if (applicableDuties([duty], d, calendar).length === 0) continue;
          if (!isOnLeave(allLeaves, primary, d)) {
            bumpPrimary(duty.id, primary);
          } else {
            // คนหลักลา → หาคนแทนยุติธรรม (ข้ามคนห้ามแทน + คนหลักรายเดือน) ·
            // target = คนหลัก · นับ pick เพิ่มใน history เพื่อกระจายวันถัดไป
            const sub = pickRotationSubstitute(
              subPool,
              primary,
              d,
              allLeaves,
              primariesThisPeriod,
              subHistory,
              subExcluded,
            );
            if (sub) {
              subHistory.set(sub, (subHistory.get(sub) || 0) + 1);
              bumpSub(duty.id, sub, primary, d);
            }
          }
        }
      }
    }
  }

  // ── coverage substitutes (replay รายวันทั้งช่วงเพื่อ history · นับเฉพาะ inRange) ──
  // ต้องมี employees (ชื่อ/ลำดับของ target/candidate) — ฝั่งพนักงานไม่มี → ข้าม coverage
  if (coverageDuties.length > 0 && employees && employees.length > 0) {
    const monthlyDuties = rotationDuties.filter((d) => d.period === "monthly");
    const replayStart = yearStart < fromYmd ? yearStart : fromYmd;
    const covHistory = new Map<string, number>();
    const monthlyPrimariesCache = new Map<string, Set<string>>();
    for (
      let d = new Date(`${replayStart}T00:00:00`);
      ;
      d.setDate(d.getDate() + 1)
    ) {
      const ymd = toYMD(d);
      if (ymd > toYmd) break;
      const inRange = ymd >= fromYmd;
      const ym = ymd.slice(0, 7);
      let monthlyPrimaries = monthlyPrimariesCache.get(ym);
      if (!monthlyPrimaries) {
        monthlyPrimaries = monthlyPrimariesForDay(
          monthlyDuties,
          ymd,
          employees,
        );
        monthlyPrimariesCache.set(ym, monthlyPrimaries);
      }
      const usedToday = new Set<string>();
      for (const duty of coverageDuties) {
        // ร้านปิดวันนั้น → ไม่มีคนแทน · เสาร์เปิดพิเศษ → นับปกติ
        if (applicableDuties([duty], ymd, calendar).length === 0) continue;
        for (const targetId of dutyAbsentTargets(
          duty,
          ymd,
          employees,
          allLeaves,
        )) {
          const pick = pickCoverageCandidate(
            duty,
            ymd,
            employees,
            allLeaves,
            covHistory,
            usedToday,
            monthlyPrimaries,
          );
          if (!pick) continue;
          usedToday.add(pick);
          covHistory.set(pick, (covHistory.get(pick) || 0) + 1);
          // target ของ coverage = คนในกลุ่มเป้าหมายที่ลา
          if (inRange) bumpSub(duty.id, pick, targetId, ymd);
        }
      }
    }
  }
  return result;
}

/* ─── Coverage forecast (คนแทนกลุ่มเป้าหมายล่วงหน้า) ───────────────
   หน้าที่แบบ coverage (แทนคนลา) forecast ด้วย rotation period ไม่ได้ —
   ต้องดูจากใบลาที่ยื่นไว้ว่าคนในกลุ่มเป้าหมายลาวันไหน แล้ว replay การ
   เลือกคนแทนแบบยุติธรรม (เคยแทนน้อยสุดก่อน) เหมือน coverage จริง
   · seed history จากต้นปี → future picks ต่อเนื่องกับที่ผ่านมา ·
   คืน segment ต่อ (duty × คนที่ลา × คนแทน) จับวันต่อเนื่องที่คนแทนคนเดิม
   เป็นช่วงเดียว

   ⚠️ ใช้ helper ชุดเดียวกับ coverage จริง (pickCoverageCandidate /
   monthlyPrimariesForDay / dutyAbsentTargets) → forecast ตรงกับที่มอบหมาย
   จริง · mirror ฝั่ง server (functions/src/duty/dutyUtils.ts) เพื่อให้
   snapshot ที่พนักงานเห็นตรงกับผลนี้                                        */
export interface CoverageForecastEntry {
  dutyId: string;
  dutyName: string;
  start: string; // YYYY-MM-DD (inclusive)
  end: string; // YYYY-MM-DD (inclusive · รวมวันต่อเนื่องที่คนแทนคนเดิม)
  targetEmpId: string; // คนในกลุ่มเป้าหมายที่ลา
  substituteEmpId: string | null; // null = หาคนแทนไม่ได้ (ทุกคนติด/ลา)
}

/** วันถัดไป (YYYY-MM-DD → YYYY-MM-DD +1) — parse local-date เลี่ยง TZ */
function nextYmd(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return toYMD(d);
}

export function computeCoverageForecast(
  duties: Duty[],
  employees: Employee[],
  allLeaves: LeaveEntry[],
  todayYmd: string,
  endYmd: string,
  // ปฏิทินร้าน — วันร้านปิด (เสาร์ default / admin mark) ไม่มีคนแทน (ไม่ forecast)
  calendar?: StoreCalendarLite | null,
): CoverageForecastEntry[] {
  const coverageDuties = duties.filter((d) => d.kind === "coverage");
  if (coverageDuties.length === 0 || todayYmd > endYmd) return [];
  const monthlyDuties = duties.filter(
    (d) => d.kind !== "coverage" && d.period === "monthly",
  );
  const dutyNameById = new Map(coverageDuties.map((d) => [d.id, d.name]));

  // replay ตั้งแต่ต้นปี — history สะสมต่อเนื่อง (ยุติธรรม) · บันทึกผลเฉพาะ
  // วัน >= today (ช่วงก่อนหน้าเป็นแค่ seed ไม่แสดง)
  const yearStart = `${todayYmd.slice(0, 4)}-01-01`;
  const replayStart = yearStart < todayYmd ? yearStart : todayYmd;
  const history = new Map<string, number>();
  const monthlyPrimariesCache = new Map<string, Set<string>>();
  interface DayPick {
    dutyId: string;
    ymd: string;
    targetEmpId: string;
    substituteEmpId: string | null;
  }
  const picks: DayPick[] = [];
  const endD = new Date(`${endYmd}T00:00:00`);
  for (
    let d = new Date(`${replayStart}T00:00:00`);
    d <= endD;
    d.setDate(d.getDate() + 1)
  ) {
    const ymd = toYMD(d);
    const ym = ymd.slice(0, 7);
    let monthlyPrimaries = monthlyPrimariesCache.get(ym);
    if (!monthlyPrimaries) {
      monthlyPrimaries = monthlyPrimariesForDay(monthlyDuties, ymd, employees);
      monthlyPrimariesCache.set(ym, monthlyPrimaries);
    }
    const usedToday = new Set<string>();
    const record = ymd >= todayYmd;
    for (const duty of coverageDuties) {
      // ร้านปิดวันนั้น → ไม่มีคนแทน (ให้ตรงกับ count/pay ที่ gate แล้ว)
      if (applicableDuties([duty], ymd, calendar).length === 0) continue;
      for (const targetId of dutyAbsentTargets(
        duty,
        ymd,
        employees,
        allLeaves,
      )) {
        const pick = pickCoverageCandidate(
          duty,
          ymd,
          employees,
          allLeaves,
          history,
          usedToday,
          monthlyPrimaries,
        );
        if (pick) {
          usedToday.add(pick);
          history.set(pick, (history.get(pick) || 0) + 1);
        }
        if (record) {
          picks.push({
            dutyId: duty.id,
            ymd,
            targetEmpId: targetId,
            substituteEmpId: pick,
          });
        }
      }
    }
  }

  // group วันต่อเนื่อง (duty × target × substitute เดิม) → segment เดียว
  picks.sort(
    (a, b) =>
      a.dutyId.localeCompare(b.dutyId) ||
      a.targetEmpId.localeCompare(b.targetEmpId) ||
      a.ymd.localeCompare(b.ymd),
  );
  const out: CoverageForecastEntry[] = [];
  for (const p of picks) {
    const last = out[out.length - 1];
    if (
      last &&
      last.dutyId === p.dutyId &&
      last.targetEmpId === p.targetEmpId &&
      last.substituteEmpId === p.substituteEmpId &&
      nextYmd(last.end) === p.ymd
    ) {
      last.end = p.ymd;
    } else {
      out.push({
        dutyId: p.dutyId,
        dutyName: dutyNameById.get(p.dutyId) || "",
        start: p.ymd,
        end: p.ymd,
        targetEmpId: p.targetEmpId,
        substituteEmpId: p.substituteEmpId,
      });
    }
  }
  // เรียงตามวันเริ่ม (แล้วชื่อหน้าที่) — render ตามลำดับเวลา
  out.sort(
    (a, b) =>
      a.start.localeCompare(b.start) ||
      a.dutyName.localeCompare(b.dutyName, "th"),
  );
  return out;
}

/* ─── Forecast (ปฏิทินหน้าที่ล่วงหน้า) ──────────────────────────────
   คำนวณ "primary ของแต่ละ period ในอนาคต" — ใช้ pool ที่ resolve แล้ว
   (จาก server snapshot) ดังนั้นทั้ง admin/พนักงานคำนวณเองได้ client-side
   โดยไม่ต้องอ่าน employees/leaves ของคนอื่น

   primary ตาม rotation เป็น period-level (สัปดาห์/เดือน · deterministic) —
   ไม่ filter storeCalendar รายวัน เพราะ "ใครได้สัปดาห์นี้" ไม่เปลี่ยนตาม
   เสาร์เปิดพิเศษ/วันธรรมดาปิดพิเศษ (คนรับผิดชอบคงเดิม แค่บางวันอาจไม่มี
   assignment)

   coverage (คนแทนตอน primary ลา): ถ้าส่ง leaves เข้ามา → แต่ละ period
   จะมี coverage[] บอก "ช่วงวันที่ primary ลา → ใครแทน" (เท่าที่มีใบลายื่น
   ล่วงหน้า) สำหรับวางแผน · คิดเฉพาะวันที่ร้านเปิด (applicableDuties) ·
   ใช้ pool + de-collide ชุดเดียวกับ rotation → ตรงกับที่เห็นจริง            */

/** primary ของทุก duty ในวันที่ระบุ — รับ pool ที่ resolve แล้ว
 *  (dutyId → ordered empIds). ใช้ pickPrimary ตัวเดียวกับ computeAllDuties
 *  ForDay (cache + hash + skip-collision) เพื่อให้ forecast แถวสัปดาห์
 *  ปัจจุบันตรงกับ snapshot ฝั่ง server (cache มีผลเฉพาะ period ปัจจุบัน)   */
export function computeForecastPrimaries(
  duties: Duty[],
  poolByDutyId: Map<string, string[]>,
  todayYmd: string,
): Map<string, string | null> {
  const monthly = duties.filter((d) => d.period === "monthly");
  const weekly = duties.filter((d) => d.period === "weekly");
  const assigned = new Set<string>();
  const locked = new Set<string>();
  const picked = new Map<string, string>();
  const poolOf = (duty: Duty) => poolByDutyId.get(duty.id) || [];

  assignPrimaries(monthly, todayYmd, poolOf, assigned, locked, true, picked);
  assignPrimaries(weekly, todayYmd, poolOf, assigned, locked, false, picked);

  // หน้าที่ที่ pool ว่าง → null (helper ข้ามไว้)
  const result = new Map<string, string | null>();
  for (const duty of duties) result.set(duty.id, picked.get(duty.id) ?? null);
  return result;
}

/** ช่วงวันที่ primary ลา → ใครแทน (สำหรับวางแผนล่วงหน้า)
 *  substituteEmpId = null → ทุกคนใน pool ลาวันนั้น (ไม่มีคนแทน) */
export interface CoverageSegment {
  start: string; // YYYY-MM-DD (inclusive)
  end: string; // YYYY-MM-DD (inclusive · รวมวันที่คนแทนคนเดียวกันต่อเนื่อง)
  substituteEmpId: string | null;
}

export interface ForecastPeriod {
  index: number;
  start: string; // YYYY-MM-DD
  end: string;
  primaryEmpId: string | null;
  /** ช่วงที่ primary ลาในรอบนี้ → คนแทน · มีค่าเฉพาะตอนส่ง leaves เข้ามา */
  coverage?: CoverageSegment[];
}

export interface DutyForecast {
  dutyId: string;
  dutyName: string;
  period: "weekly" | "monthly";
  periods: ForecastPeriod[];
}

/* ─── คนแทนหน้าที่ประจำเดือน (rotation·monthly) — แบบไม่ซ้ำ ──────────
   เดิม substitute = "คนถัดจาก primary ในลำดับ pool" เสมอ → primary
   (คงที่ทั้งเดือน) ลากี่ครั้ง คนเดิมก็โดนซ้ำทุกครั้ง · เปลี่ยนเป็นเลือกแบบ
   ยุติธรรม "เคยแทนน้อยสุดก่อน" (history จาก replay ตั้งแต่ต้นปี — pattern
   เดียวกับ coverage duty) · เสมอกัน tie-break ด้วยลำดับ pool ต่อจาก primary
   (พฤติกรรมเดิม) · weekly คง neighbor-scan เดิม (primary หมุนทุกสัปดาห์
   โอกาสซ้ำต่ำ + ไม่อยากเปลี่ยนพฤติกรรมเกินที่ขอ)                           */

/** เลือกคนแทน 1 วัน แบบ history-fair — pass 1 ข้ามคนลา+คนติดหน้าที่อื่น ·
 *  pass 2 double-up (ข้ามแค่คนลา) · คืน null เมื่อทุกคนลา
 *  subExcluded = คนที่ admin ตั้งว่า "ไม่ให้เป็นคนแทน" ในหน้าที่นี้ (ข้ามทั้ง
 *  2 pass · ยังหมุนเป็นเวรหลักได้ตามปกติ)
 *  ⚠️ ต้องเหมือน functions/src/duty/dutyUtils.ts เป๊ะ (check-duty-sync)   */
export function pickRotationSubstitute(
  pool: string[],
  primary: string,
  ymd: string,
  leaves: LeaveEntry[],
  busy: Set<string>,
  history: Map<string, number>,
  subExcluded: Set<string>,
): string | null {
  const startIdx = Math.max(0, pool.indexOf(primary));
  const len = pool.length;
  const cands = pool
    .filter((id) => id !== primary && !subExcluded.has(id))
    .sort((a, b) => {
      const ha = history.get(a) || 0;
      const hb = history.get(b) || 0;
      if (ha !== hb) return ha - hb;
      const da = (pool.indexOf(a) - startIdx + len) % len;
      const db = (pool.indexOf(b) - startIdx + len) % len;
      return da - db;
    });
  for (const cand of cands) {
    if (isOnLeave(leaves, cand, ymd)) continue;
    if (busy.has(cand)) continue;
    return cand;
  }
  for (const cand of cands) {
    if (isOnLeave(leaves, cand, ymd)) continue;
    return cand;
  }
  return null;
}

/** Replay การแทน (rotation) ตั้งแต่ fromYmd → ก่อน toYmdExclusive — weekly+monthly
 *  นับว่าใครแทนไปกี่ครั้ง (seed ให้เลือกคนแทนแบบไม่ซ้ำต่อเนื่องกับที่ผ่านมา)
 *  stateless: primary รอบก่อนๆ ประมาณจาก pool ปัจจุบัน (tradeoff เดียวกับ
 *  coverage replay) · ข้าม busy-check ของวันในอดีต (ไม่รู้หน้าที่อื่นย้อนหลัง —
 *  approximation เท่ากันทั้ง client/server)
 *  ⚠️ ต้องเหมือน functions/src/duty/dutyUtils.ts เป๊ะ (check-duty-sync)   */
export function replayRotationSubHistory(
  duty: Duty,
  pool: string[],
  allLeaves: LeaveEntry[],
  calendar: StoreCalendarLite | null | undefined,
  fromYmd: string,
  toYmdExclusive: string,
): Map<string, number> {
  const history = new Map<string, number>();
  if (pool.length === 0) return history;
  const subExcluded = new Set(duty.substituteExcludedEmpIds || []);
  // primary ต่อ "รอบ" (period index) — weekly=สัปดาห์ · monthly=เดือน
  const primaryByPeriod = new Map<number, string | null>();
  const end = new Date(`${toYmdExclusive}T00:00:00`);
  for (
    let d = new Date(`${fromYmd}T00:00:00`);
    d < end;
    d.setDate(d.getDate() + 1)
  ) {
    const ymd = toYMD(d);
    if (applicableDuties([duty], ymd, calendar).length === 0) continue;
    const idx = Math.max(0, getPeriodIndex(duty, ymd));
    let primary = primaryByPeriod.get(idx);
    if (primary === undefined) {
      primary = pickPrimary(duty, pool, idx, new Set());
      primaryByPeriod.set(idx, primary);
    }
    if (!primary || !isOnLeave(allLeaves, primary, ymd)) continue;
    const pick = pickRotationSubstitute(
      pool,
      primary,
      ymd,
      allLeaves,
      new Set(),
      history,
      subExcluded,
    );
    if (pick) history.set(pick, (history.get(pick) || 0) + 1);
  }
  return history;
}

/** หาคนแทน 1 วัน — mirror substitute-scan ของ computeDutyForDay บน id pool
 *  pass 1: ข้ามคนลา + ข้ามคนที่เป็น primary หน้าที่อื่นวันนั้น (กันทับ)
 *  pass 2: double-up — ข้ามแค่คนลา · คืน null เมื่อทุกคนใน pool ลา
 *  subExcluded = คนที่ admin ตั้ง "ไม่ให้เป็นคนแทน" ในหน้าที่นี้ (ข้ามทั้ง 2 pass) */
function pickForecastSubstitute(
  pool: string[],
  primary: string,
  ymd: string,
  leaves: LeaveEntry[],
  primariesThatDay: Set<string>,
  subExcluded: Set<string>,
): string | null {
  const startIdx = Math.max(0, pool.indexOf(primary));
  for (let offset = 1; offset < pool.length; offset++) {
    const cand = pool[(startIdx + offset) % pool.length];
    if (cand === primary) continue;
    if (subExcluded.has(cand)) continue;
    if (isOnLeave(leaves, cand, ymd)) continue;
    if (primariesThatDay.has(cand)) continue;
    return cand;
  }
  for (let offset = 1; offset < pool.length; offset++) {
    const cand = pool[(startIdx + offset) % pool.length];
    if (cand === primary) continue;
    if (subExcluded.has(cand)) continue;
    if (isOnLeave(leaves, cand, ymd)) continue;
    return cand;
  }
  return null;
}

/** coverage ของ 1 period — ไล่ทุกวันในช่วง (clamp today..endYmd) หาว่าวันไหน
 *  primary ลา + ร้านเปิด (applicableDuties) → คำนวณคนแทน · group วันต่อเนื่อง
 *  ที่คนแทนคนเดียวกันเป็น segment เดียว · วันที่ไม่ลา/ร้านปิด = ตัด segment */
function computePeriodCoverage(
  duty: Duty,
  periodStart: string,
  periodEnd: string,
  primary: string,
  todayYmd: string,
  endYmd: string,
  poolByDutyId: Map<string, string[]>,
  leaves: LeaveEntry[],
  calendar: StoreCalendarLite | null | undefined,
  primariesAt: (ymd: string) => Map<string, string | null>,
  // dutyId ของหน้าที่รายเดือน — weekly กันคนหลักรายเดือนออกจาก pool คนแทน
  monthlyDutyIds: Set<string>,
  // history การแทนสะสม (mutable · แชร์ข้าม period ของ duty เดียวกัน) → เลือก
  // คนแทนแบบยุติธรรม + นับ pick ล่วงหน้าต่อเนื่อง (weekly + monthly)
  subHistory: Map<string, number> | null,
): CoverageSegment[] {
  const dayStart = periodStart < todayYmd ? todayYmd : periodStart;
  const dayEnd = periodEnd > endYmd ? endYmd : periodEnd;
  if (dayStart > dayEnd) return [];
  const fullPool = poolByDutyId.get(duty.id) || [];
  const subExcluded = new Set(duty.substituteExcludedEmpIds || []);
  const segs: CoverageSegment[] = [];
  let cur: CoverageSegment | null = null;
  for (const d of dateRange(dayStart, dayEnd)) {
    // วันที่ primary ไม่ลา หรือร้านปิด/หน้าที่ไม่ทำงานวันนั้น → ไม่มี coverage
    if (
      !isOnLeave(leaves, primary, d) ||
      applicableDuties([duty], d, calendar).length === 0
    ) {
      cur = null;
      continue;
    }
    const primariesThatDay = new Set<string>();
    // คนหลักรายเดือนวันนั้น — กันออกจาก pool คนแทนรายสัปดาห์
    const monthlyPrimariesThatDay = new Set<string>();
    for (const [dId, v] of primariesAt(d)) {
      if (!v) continue;
      primariesThatDay.add(v);
      if (monthlyDutyIds.has(dId)) monthlyPrimariesThatDay.add(v);
    }
    // weekly ตัดคนหลักรายเดือนออก (fallback pool เต็มถ้าว่าง)
    const reduced =
      duty.period === "weekly"
        ? fullPool.filter((id) => !monthlyPrimariesThatDay.has(id))
        : fullPool;
    const pool = reduced.length > 0 ? reduced : fullPool;
    const sub = subHistory
      ? pickRotationSubstitute(
          pool,
          primary,
          d,
          leaves,
          primariesThatDay,
          subHistory,
          subExcluded,
        )
      : pickForecastSubstitute(
          pool,
          primary,
          d,
          leaves,
          primariesThatDay,
          subExcluded,
        );
    if (subHistory && sub) subHistory.set(sub, (subHistory.get(sub) || 0) + 1);
    if (cur && cur.substituteEmpId === sub) {
      cur.end = d;
    } else {
      cur = { start: d, end: d, substituteEmpId: sub };
      segs.push(cur);
    }
  }
  return segs;
}

/** Forecast ของทุก duty ตั้งแต่ period ปัจจุบัน → endYmd (เช่นสิ้นปี)
 *  คืน per-duty timeline. คำนวณ primary ณ ต้น period แต่ละช่วง (cache
 *  ตามวันที่เพื่อไม่คำนวณซ้ำ)                                              */
export function computeDutyForecast(
  duties: Duty[],
  poolByDutyId: Map<string, string[]>,
  todayYmd: string,
  endYmd: string,
  // ส่ง leaves เข้ามา → แต่ละ period จะมี coverage (primary ลา → ใครแทน วันไหน)
  // เพื่อให้พนักงาน/admin วางแผนล่วงหน้าได้จริง · ไม่ส่ง = rotation ล้วน (เดิม)
  leaves?: LeaveEntry[],
  calendar?: StoreCalendarLite | null,
): DutyForecast[] {
  // coverage duty (เวรแทน) เอง forecast ล่วงหน้าไม่ได้ — แต่ rotation duty
  // เราเติม coverage (คนแทนตอน primary ลา) ได้ถ้ามี leaves
  const rotationDuties = duties.filter((d) => d.kind !== "coverage");
  // dutyId ของหน้าที่รายเดือน — weekly กันคนหลักรายเดือนออกจาก pool คนแทน
  const monthlyDutyIds = new Set(
    rotationDuties.filter((d) => d.period === "monthly").map((d) => d.id),
  );
  const cache = new Map<string, Map<string, string | null>>();
  const primariesAt = (ymd: string) => {
    const key = ymd < todayYmd ? todayYmd : ymd;
    let m = cache.get(key);
    if (!m) {
      m = computeForecastPrimaries(rotationDuties, poolByDutyId, key);
      cache.set(key, m);
    }
    return m;
  };
  const withCoverage = !!leaves?.length;
  // คนหลักรายเดือน ณ วันนี้ — ใช้กันออกจาก pool คนแทนรายสัปดาห์ตอน seed history
  const monthlyPrimaryIdsToday = new Set<string>();
  if (withCoverage) {
    for (const [dId, v] of primariesAt(todayYmd)) {
      if (v && monthlyDutyIds.has(dId)) monthlyPrimaryIdsToday.add(v);
    }
  }

  return rotationDuties.map((duty) => {
    const periods: ForecastPeriod[] = [];
    let idx = Math.max(0, getPeriodIndex(duty, todayYmd));
    // seed history การแทนตั้งแต่ต้นปีถึงวันนี้ → คนแทนล่วงหน้าเลือกยุติธรรม
    // ต่อเนื่องกับที่ผ่านมา (map แชร์ mutable ข้าม period · computePeriodCoverage
    // เดินวันตามลำดับ + นับ pick เพิ่มเอง) · weekly กันคนหลักรายเดือนออกจาก seed pool
    const subHistory = withCoverage
      ? replayRotationSubHistory(
          duty,
          duty.period === "weekly"
            ? (poolByDutyId.get(duty.id) || []).filter(
                (id) => !monthlyPrimaryIdsToday.has(id),
              )
            : poolByDutyId.get(duty.id) || [],
          leaves ?? [],
          calendar,
          `${todayYmd.slice(0, 4)}-01-01`,
          todayYmd,
        )
      : null;
    // เดินไปข้างหน้าจน period start เกิน endYmd (safety cap 80 รอบ)
    while (periods.length < 80) {
      const range = getPeriodRangeForIndex(duty, idx);
      if (range.start > endYmd) break;
      const repDate = range.start < todayYmd ? todayYmd : range.start;
      const primary = primariesAt(repDate).get(duty.id) ?? null;
      const period: ForecastPeriod = {
        index: idx,
        start: range.start,
        end: range.end,
        primaryEmpId: primary,
      };
      if (withCoverage && primary) {
        const cov = computePeriodCoverage(
          duty,
          range.start,
          range.end,
          primary,
          todayYmd,
          endYmd,
          poolByDutyId,
          leaves ?? [],
          calendar,
          primariesAt,
          monthlyDutyIds,
          subHistory,
        );
        if (cov.length) period.coverage = cov;
      }
      periods.push(period);
      idx++;
    }
    return {
      dutyId: duty.id,
      dutyName: duty.name,
      period: duty.period,
      periods,
    };
  });
}

/** จำนวนครั้งที่แต่ละคนเป็น "คนหลัก" (primary) ต่อ rotation duty ในช่วง
 *  [fromYmd, toYmd] — นับทุกรอบที่เริ่มแล้ว (start ≤ toYmd) และ overlap ช่วง
 *  รวมรอบปัจจุบันด้วย · คำนวณจากสูตร rotation (caveat เดียวกับ computeDutyHistory:
 *  ไม่ใช่ log จริง · ใช้ pool ปัจจุบัน · ไม่นับผลการลา)
 *  → Map(dutyId → Map(empId → count))                                      */
export function computeDutyCounts(
  duties: Duty[],
  poolByDutyId: Map<string, string[]>,
  fromYmd: string,
  toYmd: string,
): Map<string, Map<string, number>> {
  const rotationDuties = duties.filter((d) => d.kind !== "coverage");
  const cache = new Map<string, Map<string, string | null>>();
  const primariesAt = (ymd: string) => {
    let mm = cache.get(ymd);
    if (!mm) {
      mm = computeForecastPrimaries(rotationDuties, poolByDutyId, ymd);
      cache.set(ymd, mm);
    }
    return mm;
  };
  const result = new Map<string, Map<string, number>>();
  for (const duty of rotationDuties) {
    const counts = new Map<string, number>();
    const currentIdx = Math.max(0, getPeriodIndex(duty, toYmd));
    for (let idx = 0; idx <= currentIdx; idx++) {
      const range = getPeriodRangeForIndex(duty, idx);
      if (range.end < fromYmd) continue;
      if (range.start > toYmd) break;
      const primary = primariesAt(range.start).get(duty.id);
      if (primary) counts.set(primary, (counts.get(primary) || 0) + 1);
    }
    result.set(duty.id, counts);
  }
  return result;
}

/** ประวัติการหมุนเวียน "ย้อนหลัง" — คำนวณคนหลัก (primary) ของแต่ละรอบในอดีต
 *  ตั้งแต่ fromYmd จนถึงก่อน todayYmd · period เรียงจากเก่า→ใหม่ในแต่ละ duty
 *  (modal จัดกลุ่มเป็นเดือนแล้ว sort เอง)
 *
 *  ใช้สูตร rotation ตัวเดียวกับ forecast (de-collide ข้ามหน้าที่ที่ pool ซ้ำ) แต่
 *  คำนวณที่ "วันเริ่มของรอบนั้นจริง" (ไม่ clamp เป็นวันนี้แบบ forecast) → ได้คน
 *  ที่สูตรกำหนดให้รอบอดีตนั้นๆ · cachedPrimary ไม่กระทบ (match เฉพาะรอบปัจจุบัน)
 *
 *  ⚠️ ไม่ใช่ log จริง — ระบบไม่ได้เก็บประวัติเวรรายวัน · เป็นการคำนวณย้อนด้วย
 *  pool ปัจจุบัน จึงตรงกับที่เกิดจริงเฉพาะช่วงที่ pool (คนที่ admin เลือก) ไม่เปลี่ยน
 *  และไม่นับผลของการลา/คนแทนในอดีต (แสดงคนหลักตามรอบเท่านั้น)                */
export function computeDutyHistory(
  duties: Duty[],
  poolByDutyId: Map<string, string[]>,
  fromYmd: string,
  todayYmd: string,
): DutyForecast[] {
  const rotationDuties = duties.filter((d) => d.kind !== "coverage");
  const cache = new Map<string, Map<string, string | null>>();
  const primariesAt = (ymd: string) => {
    let m = cache.get(ymd);
    if (!m) {
      m = computeForecastPrimaries(rotationDuties, poolByDutyId, ymd);
      cache.set(ymd, m);
    }
    return m;
  };
  return rotationDuties.map((duty) => {
    const periods: ForecastPeriod[] = [];
    const currentIdx = Math.max(0, getPeriodIndex(duty, todayYmd));
    // เดินถอยหลังจากรอบก่อนปัจจุบัน จน period.end < fromYmd หรือหมด index
    // (cap 60 รอบ กัน loop ยาวเกิน)
    for (let idx = currentIdx - 1; idx >= 0 && periods.length < 60; idx--) {
      const range = getPeriodRangeForIndex(duty, idx);
      if (range.end < fromYmd) break;
      periods.push({
        index: idx,
        start: range.start,
        end: range.end,
        primaryEmpId: primariesAt(range.start).get(duty.id) ?? null,
      });
    }
    return {
      dutyId: duty.id,
      dutyName: duty.name,
      period: duty.period,
      periods,
    };
  });
}
