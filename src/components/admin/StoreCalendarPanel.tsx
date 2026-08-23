/* ─── StoreCalendarPanel — ปฏิทินวันเปิด-ปิดร้าน ────────────────────
   3 การ์ดในหน้าเดียว:
   1. เสาร์เปิดพิเศษ  — admin เพิ่มเสาร์ที่ให้พนักงานมาทำงาน
   2. วันธรรมดาปิดพิเศษ — admin เพิ่ม จ-ศ ที่ปิดร้าน (อบรม/หยุดยาว ฯลฯ)
   3. อาทิตย์ปิดพิเศษ — admin เพิ่มอาทิตย์ที่ปิดร้าน (ลาไม่นับ · ไม่หัก × 1.5)
   เพิ่ม → save ทันที (real-time sync) · ลบ → save ทันที                  */

import {
  AlertTriangle as IconAlertTriangle,
  CalendarOff as IconCalendarOff,
  CalendarPlus as IconCalendarPlus,
  Plus as IconPlus,
  Store as IconStore,
  Sun as IconSun,
  Trash2 as IconTrash,
  X as IconX,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { Employee, LeaveEntry, StoreCalendar } from "../../types";
import {
  currentYearMonth,
  dateRange,
  fmtShortWithWeekday,
} from "../../utils/dateUtils";
import BaseModal from "../shared/BaseModal";
import CalendarPicker from "../shared/CalendarPicker";
import MonthChevronNav from "../shared/MonthChevronNav";
import Spinner from "../shared/Spinner";
import ThemedSelect from "../shared/ThemedSelect";

/** ความสูง dropdown เสาร์/อาทิตย์ — โชว์ ~10 รายการก่อน scroll (6 เดือนมีหลายวัน) */
const DROPDOWN_MAX_HEIGHT = 380;

interface Props {
  storeCalendar: StoreCalendar;
  onUpdate: (cal: StoreCalendar) => Promise<void>;
  allLeaves: LeaveEntry[];
  employeeDirectory: Employee[];
  /** ลบใบลา · ใช้ใน cascade-delete ตอนลบวันออกจากปฏิทิน
   *  (ใบลาที่ครอบวันนั้นถูกลบทิ้งด้วย กัน frozen lv.days mismatch recompute) */
  onDeleteLeave: (id: string | number) => void | Promise<void>;
  showToast?: (msg: string) => void;
}

/** alias สำหรับใช้ชื่อเดิมใน panel นี้ */
const fmtYmd = fmtShortWithWeekday;

/** สร้าง list ของวัน (ตาม day-of-week) ใน 6 เดือนถัดไปจาก today
 *  · targetDow 6 = เสาร์ · 0 = อาทิตย์ — ใช้เป็น dropdown options
 *  · dropdown (ThemedSelect) จะ scroll เมื่อรายการเกินความสูงที่ตั้งไว้ */
function buildDowOptions(targetDow: number): { ymd: string; label: string }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setMonth(end.getMonth() + 6);
  const out: { ymd: string; label: string }[] = [];
  const c = new Date(today);
  while (c <= end) {
    if (c.getDay() === targetDow) {
      const y = c.getFullYear();
      const m = String(c.getMonth() + 1).padStart(2, "0");
      const d = String(c.getDate()).padStart(2, "0");
      const ymd = `${y}-${m}-${d}`;
      out.push({ ymd, label: fmtYmd(ymd) });
    }
    c.setDate(c.getDate() + 1);
  }
  return out;
}

/** date input → YYYY-MM-DD (validate ว่าเป็น จ-ศ) */
function isWeekday(ymd: string): boolean {
  const [y, m, d] = ymd.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return dow >= 1 && dow <= 5;
}

/** date input → YYYY-MM-DD (validate ว่าเป็นวันอาทิตย์) */
function isSundayYmd(ymd: string): boolean {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).getDay() === 0;
}

/** หาใบลาที่ active วันที่ ymd · return entries (full · ใช้ cascade delete + display) */
function leavesOnDate(ymd: string, allLeaves: LeaveEntry[]): LeaveEntry[] {
  return allLeaves.filter((lv) => lv.start <= ymd && ymd <= lv.end);
}

/** display name ของเจ้าของใบลา · live nickname > snapshot */
function leaveOwnerName(lv: LeaveEntry, directory: Employee[]): string {
  const live = directory.find((e) => e.id === lv.employeeId);
  return live?.nickname || lv.employeeNickname || live?.name || lv.employeeName;
}

/** label ของช่วงใบลา · "1 วัน" หรือ "5 วัน (15-19 ก.ค.)" */
function leaveRangeLabel(lv: LeaveEntry): string {
  if (lv.start === lv.end) return `${lv.days} วัน`;
  return `${lv.days} วัน (${fmtShortWithWeekday(lv.start)} – ${fmtShortWithWeekday(lv.end)})`;
}

export default function StoreCalendarPanel({
  storeCalendar,
  onUpdate,
  allLeaves,
  employeeDirectory,
  onDeleteLeave,
  showToast,
}: Props) {
  const [adding, setAdding] = useState<"sat" | "wd" | "sun" | null>(null);
  const [satPick, setSatPick] = useState("");
  // วันธรรมดาปิดพิเศษ — เลือกเป็นช่วงได้ (เช่น อบรม จ-ศ ทั้งสัปดาห์)
  const [wdStart, setWdStart] = useState("");
  const [wdEnd, setWdEnd] = useState("");
  const [sunPick, setSunPick] = useState("");
  const [busy, setBusy] = useState(false);
  // selected month (YYYY-MM) — filter list ทั้ง sat/wd ตามเดือนนี้
  // default = current month · auto-jump เมื่อ admin เพิ่มวันในเดือนอื่น
  const [selectedMonth, setSelectedMonth] = useState<string>(
    currentYearMonth(),
  );
  // confirm-before-remove · เปิด modal ตอน admin ลบเฉพาะวันที่มีใบลา ·
  // วันไหนไม่มีใบลาลบเลย ไม่ต้อง confirm
  // cascade: ยืนยันลบ → ลบใบลาทุกใบในวันนี้ก่อน → แล้วค่อยลบวันออกจากปฏิทิน
  // (กัน frozen lv.days ค้างไม่ตรงกับ recompute หลังเปลี่ยนปฏิทิน)
  const [confirmRemove, setConfirmRemove] = useState<{
    field: keyof StoreCalendar;
    ymd: string;
    leaves: LeaveEntry[];
  } | null>(null);

  // months สำหรับ MonthChevronNav (เรียงใหม่→เก่า) ·
  // รวม: เดือนปัจจุบัน + เดือนที่มีข้อมูล + 3 เดือนข้างหน้า (กัน admin
  // เลือก future month ไว้กรอก)
  const months = useMemo(() => {
    const set = new Set<string>();
    const cur = currentYearMonth();
    set.add(cur);
    set.add(selectedMonth);
    // 3 เดือนข้างหน้านับจากปัจจุบัน
    const [cy, cm] = cur.split("-").map(Number);
    for (let i = 1; i <= 3; i++) {
      const dt = new Date(cy, cm - 1 + i, 1);
      set.add(
        `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`,
      );
    }
    // ทุกเดือนที่มีข้อมูล (sat + wd + sun · past + future)
    for (const d of [
      ...storeCalendar.extraOpenSaturdays,
      ...storeCalendar.extraClosedWeekdays,
      ...(storeCalendar.extraClosedSundays ?? []),
    ]) {
      set.add(d.slice(0, 7));
    }
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [storeCalendar, selectedMonth]);

  // เสาร์ตัวเลือก: future-only AND ยังไม่เคย mark ไว้
  const satOptions = buildDowOptions(6).filter(
    (o) => !storeCalendar.extraOpenSaturdays.includes(o.ymd),
  );
  // อาทิตย์ตัวเลือก: future-only AND ยังไม่เคย mark ไว้ (mirror เสาร์)
  const sunOptions = buildDowOptions(0).filter(
    (o) => !(storeCalendar.extraClosedSundays ?? []).includes(o.ymd),
  );

  async function addSaturday() {
    if (!satPick || busy) return;
    setBusy(true);
    try {
      await onUpdate({
        ...storeCalendar,
        extraOpenSaturdays: [...storeCalendar.extraOpenSaturdays, satPick],
      });
      // auto-jump ไปเดือนของวันที่เพิ่ง add → admin เห็นว่าเข้าระบบแล้ว
      setSelectedMonth(satPick.slice(0, 7));
      setSatPick("");
      setAdding(null);
      showToast?.("เพิ่มเสาร์เปิดพิเศษแล้ว");
    } catch (e) {
      console.error(e);
      showToast?.("เพิ่มไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function addWeekday() {
    if (!wdStart || !wdEnd || busy) return;
    if (wdEnd < wdStart) {
      showToast?.("ช่วงวันไม่ถูกต้อง — วันสิ้นสุดต้องไม่ก่อนวันเริ่ม");
      return;
    }
    // เก็บเฉพาะ จ-ศ ในช่วง ที่ยังไม่อยู่ในรายการ (ข้ามเสาร์/อาทิตย์อัตโนมัติ)
    const existing = new Set(storeCalendar.extraClosedWeekdays);
    const toAdd = dateRange(wdStart, wdEnd).filter(
      (ymd) => isWeekday(ymd) && !existing.has(ymd),
    );
    if (toAdd.length === 0) {
      showToast?.("ไม่มีวันธรรมดาใหม่ในช่วงที่เลือก");
      return;
    }
    setBusy(true);
    try {
      await onUpdate({
        ...storeCalendar,
        extraClosedWeekdays: [...storeCalendar.extraClosedWeekdays, ...toAdd],
      });
      // auto-jump ไปเดือนของวันเริ่ม
      setSelectedMonth(wdStart.slice(0, 7));
      setWdStart("");
      setWdEnd("");
      setAdding(null);
      showToast?.(`เพิ่มวันธรรมดาปิดพิเศษ ${toAdd.length} วันแล้ว`);
    } catch (e) {
      console.error(e);
      showToast?.("เพิ่มไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function addSunday() {
    if (!sunPick || busy) return;
    if (!isSundayYmd(sunPick)) {
      showToast?.("ต้องเป็นวันอาทิตย์");
      return;
    }
    if ((storeCalendar.extraClosedSundays ?? []).includes(sunPick)) {
      showToast?.("วันนี้อยู่ในรายการแล้ว");
      return;
    }
    setBusy(true);
    try {
      await onUpdate({
        ...storeCalendar,
        extraClosedSundays: [
          ...(storeCalendar.extraClosedSundays ?? []),
          sunPick,
        ],
      });
      // auto-jump ไปเดือนของวันที่เพิ่ง add
      setSelectedMonth(sunPick.slice(0, 7));
      setSunPick("");
      setAdding(null);
      showToast?.("เพิ่มอาทิตย์ปิดพิเศษแล้ว");
    } catch (e) {
      console.error(e);
      showToast?.("เพิ่มไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function remove(field: keyof StoreCalendar, ymd: string) {
    if (busy) return;
    setBusy(true);
    try {
      await onUpdate({
        ...storeCalendar,
        [field]: (storeCalendar[field] as string[]).filter((d) => d !== ymd),
      });
      showToast?.("ลบแล้ว");
    } catch (e) {
      console.error(e);
      showToast?.(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  /** ตรวจใบลาก่อนลบ · ถ้ามี → confirm modal · ไม่มี → ลบเลย */
  function requestRemove(field: keyof StoreCalendar, ymd: string) {
    if (busy) return;
    const leaves = leavesOnDate(ymd, allLeaves);
    if (leaves.length === 0) {
      remove(field, ymd);
      return;
    }
    setConfirmRemove({ field, ymd, leaves });
  }

  /** cascade-delete · ลบใบลาทุกใบในวันนั้นก่อน → แล้วลบวันออกจากปฏิทิน
   *  · ใบลาหลายวันถูกลบทั้งใบ (admin เห็นช่วงในก่อนยืนยัน · ตัดสินใจเองได้) */
  async function cascadeRemove(
    field: keyof StoreCalendar,
    ymd: string,
    leaves: LeaveEntry[],
  ) {
    if (busy) return;
    setBusy(true);
    try {
      // ลบใบลาแบบ parallel · ใบไหน fail = abort ทั้งหมด (ไม่ remove calendar)
      await Promise.all(leaves.map((lv) => onDeleteLeave(lv.id)));
      // ลบ calendar mark — ใช้ logic เดียวกับ remove() แต่ inline เพื่อรวม
      // toast เป็นครั้งเดียว (จะได้ไม่โชว์ "ลบแล้ว" ซ้อน)
      await onUpdate({
        ...storeCalendar,
        [field]: (storeCalendar[field] as string[]).filter((d) => d !== ymd),
      });
      showToast?.(`ลบใบลา ${leaves.length} ใบ + ลบวันออกจากปฏิทินแล้ว`);
    } catch (e) {
      console.error(e);
      showToast?.(e instanceof Error ? e.message : "ลบไม่สำเร็จ — ลองอีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  // วันที่ในอดีต → เทาๆ (เก็บไว้แต่ลบเองได้)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isPast = (ymd: string) => {
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(y, m - 1, d) < today;
  };

  // filter by selectedMonth + แยก past/future สำหรับ render
  function partition(list: string[]) {
    const inMonth = list.filter((d) => d.startsWith(`${selectedMonth}-`));
    const sorted = [...inMonth].sort();
    return {
      upcoming: sorted.filter((d) => !isPast(d)),
      past: sorted.filter(isPast),
    };
  }
  const sat = partition(storeCalendar.extraOpenSaturdays);
  const wd = partition(storeCalendar.extraClosedWeekdays);
  const sun = partition(storeCalendar.extraClosedSundays ?? []);

  const monthlyCount =
    sat.upcoming.length +
    sat.past.length +
    wd.upcoming.length +
    wd.past.length +
    sun.upcoming.length +
    sun.past.length;

  return (
    <div className="flex flex-col gap-3.5">
      {/* intro */}
      <div className="px-3.5 py-2.5 rounded-[10px] bg-cream border border-bdr text-sm text-txt-mid">
        <b className="text-maroon inline-flex items-center gap-1.5">
          <IconStore size={14} strokeWidth={2.4} />
          ปฏิทินเปิด-ปิดร้าน
        </b>
        <div className="mt-1 leading-relaxed">
          ค่าเริ่มต้น: <b>เสาร์ปิด</b> · <b>อาทิตย์เปิด</b> · <b>จันทร์-ศุกร์ เปิด</b>
          <br />
          ใส่ข้อยกเว้นในรายการด้านล่าง — ระบบจะใช้คำนวณหน้าที่ + การลาให้ทันที
        </div>
      </div>

      {/* Month nav — เลือกเดือนเพื่อกรองรายการ sat/wd */}
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-txt-soft">ดูเดือน</div>
        <MonthChevronNav
          months={months}
          selected={selectedMonth}
          onSelect={setSelectedMonth}
          subtitle={monthlyCount > 0 ? `${monthlyCount} รายการ` : "ไม่มีรายการ"}
        />
      </div>

      {/* เสาร์เปิดพิเศษ */}
      <div className="rounded-[12px] border border-bdr bg-white">
        <div className="px-3.5 py-3 border-b border-bdr flex items-center gap-2">
          <IconCalendarPlus
            size={16}
            strokeWidth={2.4}
            className="text-green"
          />
          <div className="flex-1">
            <div className="font-bold text-maroon text-sm">เสาร์เปิดพิเศษ</div>
            <div className="text-xs text-txt-soft mt-0.5">
              เสาร์ที่ ADMIN ให้เปิดร้าน — คิดเหมือนวันธรรมดา
            </div>
          </div>
          {adding !== "sat" && (
            <button
              type="button"
              onClick={() => setAdding("sat")}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[9px] bg-green-lt text-green border border-green/25 text-xs font-bold cursor-pointer font-[inherit] active:scale-[0.96] transition-transform"
            >
              <IconPlus size={13} strokeWidth={2.6} />
              เพิ่ม
            </button>
          )}
        </div>

        {/* add row */}
        {adding === "sat" && (
          <div className="border-b border-bdr bg-cream/40">
            <div className="px-3.5 py-3 flex gap-2 items-center">
              <div className="flex-1 min-w-0">
                <ThemedSelect
                  value={satPick}
                  onChange={setSatPick}
                  options={satOptions.map((o) => ({
                    value: o.ymd,
                    label: o.label,
                  }))}
                  placeholder="— เลือกเสาร์ —"
                  maxHeightPx={DROPDOWN_MAX_HEIGHT}
                  className="pl-2.5 pr-7 py-2 rounded-[8px] border border-bdr text-sm font-semibold outline-none font-[inherit] bg-white text-txt cursor-pointer text-left w-full flex items-center relative"
                />
              </div>
              <button
                type="button"
                onClick={addSaturday}
                disabled={!satPick || busy}
                className={`px-3 py-2 rounded-[8px] border-none text-xs font-bold font-[inherit] ${
                  satPick && !busy
                    ? "bg-maroon text-white cursor-pointer"
                    : "bg-bdr text-txt-soft cursor-not-allowed"
                }`}
              >
                บันทึก
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdding(null);
                  setSatPick("");
                }}
                aria-label="ยกเลิก"
                className="w-8 h-8 rounded-[8px] border border-bdr bg-white text-txt-soft cursor-pointer flex items-center justify-center"
              >
                <IconX size={14} strokeWidth={2.2} />
              </button>
            </div>
            {/* warning: ถ้ามีใบลาในเสาร์ที่เลือก → จะกลายเป็นวันทำงาน · ใบลานับโควต้า */}
            {satPick &&
              (() => {
                const leaves = leavesOnDate(satPick, allLeaves);
                if (leaves.length === 0) return null;
                const names = leaves.map((lv) =>
                  leaveOwnerName(lv, employeeDirectory),
                );
                return (
                  <div className="mx-3.5 mb-3 px-3 py-2 rounded-[8px] bg-amber-50 border border-amber-300 text-xs leading-relaxed text-amber-900 flex gap-2">
                    <span className="shrink-0">⚠</span>
                    <div>
                      <b>มีใบลา {names.length} คนวันนี้</b> ({names.join(", ")})
                      <br />
                      หลังเปิดเสาร์นี้ ใบลาจะ <b>นับเข้าโควต้า</b> (เหมือนวันธรรมดา)
                    </div>
                  </div>
                );
              })()}
          </div>
        )}

        {/* list */}
        <div className="px-3.5 py-2.5">
          {sat.upcoming.length === 0 && sat.past.length === 0 && (
            <div className="text-sm text-txt-soft text-center py-3">
              ไม่มีรายการเดือนนี้ — กด "เพิ่ม" เพื่อกำหนดเสาร์เปิดพิเศษ
            </div>
          )}
          {sat.upcoming.map((d) => {
            return (
              <div
                key={d}
                className="flex items-center gap-2 py-1.5 border-b border-bdr/40 last:border-b-0"
              >
                <span className="flex-1 text-sm font-semibold text-txt">
                  {fmtYmd(d)}
                </span>
                <button
                  type="button"
                  onClick={() => requestRemove("extraOpenSaturdays", d)}
                  disabled={busy}
                  aria-label="ลบ"
                  className="w-7 h-7 rounded-[7px] bg-red-lt text-red border border-red/20 cursor-pointer flex items-center justify-center"
                >
                  <IconTrash size={12} strokeWidth={2.2} />
                </button>
              </div>
            );
          })}
          {sat.past.length > 0 && (
            <div className="mt-2 pt-2 border-t border-dashed border-bdr">
              <div className="text-xs text-txt-soft mb-1.5">
                ผ่านไปแล้ว ({sat.past.length})
              </div>
              {sat.past.slice(-3).map((d) => (
                <div
                  key={d}
                  className="flex items-center gap-2 py-1 opacity-50"
                >
                  <span className="flex-1 text-xs text-txt-mid">
                    {fmtYmd(d)}
                  </span>
                  <button
                    type="button"
                    onClick={() => requestRemove("extraOpenSaturdays", d)}
                    disabled={busy}
                    aria-label="ลบ"
                    className="w-6 h-6 rounded-[6px] bg-cream border border-bdr cursor-pointer flex items-center justify-center"
                  >
                    <IconX size={10} strokeWidth={2.2} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* วันธรรมดาปิดพิเศษ */}
      <div className="rounded-[12px] border border-bdr bg-white">
        <div className="px-3.5 py-3 border-b border-bdr flex items-center gap-2">
          <IconCalendarOff size={16} strokeWidth={2.4} className="text-red" />
          <div className="flex-1">
            <div className="font-bold text-maroon text-sm">วันธรรมดาปิดพิเศษ</div>
            <div className="text-xs text-txt-soft mt-0.5">
              จันทร์-ศุกร์ ที่ปิดร้าน (อบรม, หยุดยาว ฯลฯ) — ลาวันนี้ไม่นับ
            </div>
          </div>
          {adding !== "wd" && (
            <button
              type="button"
              onClick={() => setAdding("wd")}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[9px] bg-red-lt text-red border border-red/25 text-xs font-bold cursor-pointer font-[inherit] active:scale-[0.96] transition-transform"
            >
              <IconPlus size={13} strokeWidth={2.6} />
              เพิ่ม
            </button>
          )}
        </div>

        {adding === "wd" && (
          <div className="border-b border-bdr bg-cream/40">
            <div className="px-3.5 py-3">
              {/* ปฏิทินมาตรฐาน · เลือกเป็นช่วงได้ (จ-ศ เท่านั้น · ข้ามเสาร์/อาทิตย์) */}
              <div className="flex gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-txt-soft font-semibold mb-1">
                    ตั้งแต่
                  </div>
                  <CalendarPicker
                    value={wdStart}
                    onChange={(v) => {
                      setWdStart(v);
                      if (!wdEnd || wdEnd < v) setWdEnd(v);
                    }}
                    weekdaysOnly
                    size="sm"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-txt-soft font-semibold mb-1">
                    ถึง
                  </div>
                  <CalendarPicker
                    value={wdEnd}
                    onChange={setWdEnd}
                    minDate={wdStart || undefined}
                    weekdaysOnly
                    size="sm"
                  />
                </div>
              </div>
              {/* preview จำนวนวันธรรมดาที่จะปิด */}
              {wdStart &&
                wdEnd &&
                (() => {
                  const days = dateRange(wdStart, wdEnd).filter(isWeekday);
                  return (
                    <div className="text-xs text-txt-mid bg-cream/60 rounded-[8px] px-3 py-1.5 mb-2">
                      ปิด <b className="text-maroon">{days.length} วันธรรมดา</b>{" "}
                      (จ-ศ · ไม่นับเสาร์/อาทิตย์)
                    </div>
                  );
                })()}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={addWeekday}
                  disabled={!wdStart || !wdEnd || busy}
                  className={`flex-1 px-3 py-2 rounded-[8px] border-none text-xs font-bold font-[inherit] ${
                    wdStart && wdEnd && !busy
                      ? "bg-maroon text-white cursor-pointer"
                      : "bg-bdr text-txt-soft cursor-not-allowed"
                  }`}
                >
                  บันทึก
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAdding(null);
                    setWdStart("");
                    setWdEnd("");
                  }}
                  className="px-3 py-2 rounded-[8px] border border-bdr bg-white text-txt-soft text-xs font-bold cursor-pointer font-[inherit] inline-flex items-center gap-1"
                >
                  <IconX size={13} strokeWidth={2.2} />
                  ยกเลิก
                </button>
              </div>
            </div>
            {/* warning: ถ้ามีใบลาในช่วงที่ปิด → ใบลายังอยู่แต่ไม่นับโควต้า */}
            {wdStart &&
              wdEnd &&
              (() => {
                // ใบลาที่ทับช่วง [wdStart, wdEnd] (overlap)
                const leaves = allLeaves.filter(
                  (lv) => lv.start <= wdEnd && lv.end >= wdStart,
                );
                if (leaves.length === 0) return null;
                const names = [
                  ...new Set(
                    leaves.map((lv) => leaveOwnerName(lv, employeeDirectory)),
                  ),
                ];
                return (
                  <div className="mx-3.5 mb-3 px-3 py-2 rounded-[8px] bg-emerald-50 border border-emerald-300 text-xs leading-relaxed text-emerald-900 flex gap-2">
                    <span className="shrink-0">ℹ</span>
                    <div>
                      <b>มีใบลา {names.length} คนในช่วงนี้</b> ({names.join(", ")})
                      <br />
                      หลังปิด ใบลายังอยู่ในระบบ แต่ <b>ไม่นับโควต้า · ไม่หักเงิน</b>{" "}
                      (ระบบคืนสิทธิ์ลาให้อัตโนมัติ)
                    </div>
                  </div>
                );
              })()}
          </div>
        )}

        <div className="px-3.5 py-2.5">
          {wd.upcoming.length === 0 && wd.past.length === 0 && (
            <div className="text-sm text-txt-soft text-center py-3">
              ไม่มีรายการเดือนนี้ — ปกติเปิดทุก จ-ศ
            </div>
          )}
          {wd.upcoming.map((d) => (
            <div
              key={d}
              className="flex items-center gap-2 py-1.5 border-b border-bdr/40 last:border-b-0"
            >
              <span className="flex-1 text-sm font-semibold text-txt">
                {fmtYmd(d)}
              </span>
              <button
                type="button"
                onClick={() => requestRemove("extraClosedWeekdays", d)}
                disabled={busy}
                aria-label="ลบ"
                className="w-7 h-7 rounded-[7px] bg-red-lt text-red border border-red/20 cursor-pointer flex items-center justify-center"
              >
                <IconTrash size={12} strokeWidth={2.2} />
              </button>
            </div>
          ))}
          {wd.past.length > 0 && (
            <div className="mt-2 pt-2 border-t border-dashed border-bdr">
              <div className="text-xs text-txt-soft mb-1.5">
                ผ่านไปแล้ว ({wd.past.length})
              </div>
              {wd.past.slice(-3).map((d) => (
                <div
                  key={d}
                  className="flex items-center gap-2 py-1 opacity-50"
                >
                  <span className="flex-1 text-xs text-txt-mid">
                    {fmtYmd(d)}
                  </span>
                  <button
                    type="button"
                    onClick={() => requestRemove("extraClosedWeekdays", d)}
                    disabled={busy}
                    aria-label="ลบ"
                    className="w-6 h-6 rounded-[6px] bg-cream border border-bdr cursor-pointer flex items-center justify-center"
                  >
                    <IconX size={10} strokeWidth={2.2} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* อาทิตย์ปิดพิเศษ */}
      <div className="rounded-[12px] border border-bdr bg-white">
        <div className="px-3.5 py-3 border-b border-bdr flex items-center gap-2">
          <IconSun size={16} strokeWidth={2.4} className="text-red" />
          <div className="flex-1">
            <div className="font-bold text-maroon text-sm">อาทิตย์ปิดพิเศษ</div>
            <div className="text-xs text-txt-soft mt-0.5">
              อาทิตย์ที่ปิดร้าน — ลาวันนี้ไม่นับ · ไม่หัก × 1.5
            </div>
          </div>
          {adding !== "sun" && (
            <button
              type="button"
              onClick={() => setAdding("sun")}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[9px] bg-red-lt text-red border border-red/25 text-xs font-bold cursor-pointer font-[inherit] active:scale-[0.96] transition-transform"
            >
              <IconPlus size={13} strokeWidth={2.6} />
              เพิ่ม
            </button>
          )}
        </div>

        {adding === "sun" && (
          <div className="border-b border-bdr bg-cream/40">
            <div className="px-3.5 py-3 flex gap-2 items-center">
              <div className="flex-1 min-w-0">
                <ThemedSelect
                  value={sunPick}
                  onChange={setSunPick}
                  options={sunOptions.map((o) => ({
                    value: o.ymd,
                    label: o.label,
                  }))}
                  placeholder="— เลือกอาทิตย์ —"
                  maxHeightPx={DROPDOWN_MAX_HEIGHT}
                  className="pl-2.5 pr-7 py-2 rounded-[8px] border border-bdr text-sm font-semibold outline-none font-[inherit] bg-white text-txt cursor-pointer text-left w-full flex items-center relative"
                />
              </div>
              <button
                type="button"
                onClick={addSunday}
                disabled={!sunPick || busy}
                className={`px-3 py-2 rounded-[8px] border-none text-xs font-bold font-[inherit] ${
                  sunPick && !busy
                    ? "bg-maroon text-white cursor-pointer"
                    : "bg-bdr text-txt-soft cursor-not-allowed"
                }`}
              >
                บันทึก
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdding(null);
                  setSunPick("");
                }}
                aria-label="ยกเลิก"
                className="w-8 h-8 rounded-[8px] border border-bdr bg-white text-txt-soft cursor-pointer flex items-center justify-center"
              >
                <IconX size={14} strokeWidth={2.2} />
              </button>
            </div>
            {/* warning ถ้ามีใบลาในอาทิตย์ที่เลือก → จะไม่ถูกหัก × 1.5 อีก */}
            {sunPick &&
              (() => {
                const leaves = leavesOnDate(sunPick, allLeaves);
                if (leaves.length === 0) return null;
                const names = leaves.map((lv) =>
                  leaveOwnerName(lv, employeeDirectory),
                );
                return (
                  <div className="mx-3.5 mb-3 px-3 py-2 rounded-[8px] bg-emerald-50 border border-emerald-300 text-xs leading-relaxed text-emerald-900 flex gap-2">
                    <span className="shrink-0">ℹ</span>
                    <div>
                      <b>มีใบลา {names.length} คนวันนี้</b> ({names.join(", ")})
                      <br />
                      หลังปิดอาทิตย์นี้ ใบลายังอยู่ในระบบ แต่ <b>ไม่หัก × 1.5</b> (ร้านปิด —
                      ลาไม่กระทบ)
                    </div>
                  </div>
                );
              })()}
          </div>
        )}

        <div className="px-3.5 py-2.5">
          {sun.upcoming.length === 0 && sun.past.length === 0 && (
            <div className="text-sm text-txt-soft text-center py-3">
              ไม่มีรายการเดือนนี้ — ปกติอาทิตย์เปิด (× 1.5)
            </div>
          )}
          {sun.upcoming.map((d) => (
            <div
              key={d}
              className="flex items-center gap-2 py-1.5 border-b border-bdr/40 last:border-b-0"
            >
              <span className="flex-1 text-sm font-semibold text-txt">
                {fmtYmd(d)}
              </span>
              <button
                type="button"
                onClick={() => requestRemove("extraClosedSundays", d)}
                disabled={busy}
                aria-label="ลบ"
                className="w-7 h-7 rounded-[7px] bg-red-lt text-red border border-red/20 cursor-pointer flex items-center justify-center"
              >
                <IconTrash size={12} strokeWidth={2.2} />
              </button>
            </div>
          ))}
          {sun.past.length > 0 && (
            <div className="mt-2 pt-2 border-t border-dashed border-bdr">
              <div className="text-xs text-txt-soft mb-1.5">
                ผ่านไปแล้ว ({sun.past.length})
              </div>
              {sun.past.slice(-3).map((d) => (
                <div
                  key={d}
                  className="flex items-center gap-2 py-1 opacity-50"
                >
                  <span className="flex-1 text-xs text-txt-mid">
                    {fmtYmd(d)}
                  </span>
                  <button
                    type="button"
                    onClick={() => requestRemove("extraClosedSundays", d)}
                    disabled={busy}
                    aria-label="ลบ"
                    className="w-6 h-6 rounded-[6px] bg-cream border border-bdr cursor-pointer flex items-center justify-center"
                  >
                    <IconX size={10} strokeWidth={2.2} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Confirm-remove modal — เปิดเมื่อ admin ลบวันที่มีใบลา ·
          cascade-delete: ลบใบลาทั้งหมดในวันนั้นก่อน → แล้วลบวันออกจากปฏิทิน
          กัน frozen lv.days mismatch กับ recompute หลังเปลี่ยนปฏิทิน */}
      {confirmRemove && (
        <BaseModal onClose={() => !busy && setConfirmRemove(null)}>
          <div className="bg-white rounded-2xl p-5 w-full">
            <div className="flex items-center gap-2 mb-1.5">
              <IconAlertTriangle
                size={22}
                strokeWidth={2.4}
                className="text-amber-600"
              />
              <div className="text-lg font-bold text-maroon">ยืนยันลบ?</div>
            </div>
            <div className="text-sm text-txt-mid mb-3 leading-relaxed">
              <div className="mb-1.5">
                วันที่: <b className="text-txt">{fmtYmd(confirmRemove.ymd)}</b>
              </div>
              <div>
                มีใบลา{" "}
                <b className="text-amber-800">
                  {confirmRemove.leaves.length} ใบ
                </b>{" "}
                ที่จะถูกลบ:
                <div className="mt-1 px-2.5 py-1.5 rounded-[8px] bg-cream border border-bdr text-xs leading-relaxed flex flex-col gap-0.5">
                  {confirmRemove.leaves.map((lv) => (
                    <div key={lv.id}>
                      · <b>{leaveOwnerName(lv, employeeDirectory)}</b>{" "}
                      <span className="text-txt-soft">
                        — {leaveRangeLabel(lv)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-3 py-2.5 rounded-[10px] bg-amber-50 border border-amber-300 text-xs leading-relaxed text-amber-900 mb-3.5 flex gap-2">
              <IconAlertTriangle
                size={14}
                strokeWidth={2.5}
                className="shrink-0 mt-0.5"
              />
              <div>
                ระบบจะลบใบลาข้างต้นออกก่อน <b>(รวมใบที่ครอบหลายวันด้วย)</b>{" "}
                แล้วค่อยลบวันออกจากปฏิทิน · กัน{" "}
                {confirmRemove.field === "extraOpenSaturdays"
                  ? "ใบลาค้างในเสาร์ที่กลับเป็นวันร้านปิด"
                  : "ใบลาค้างในวันที่กลับเป็นวันร้านเปิด"}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmRemove(null)}
                disabled={busy}
                className="flex-1 py-2.5 rounded-lg bg-white text-txt-mid text-sm font-bold border border-bdr cursor-pointer font-[inherit] active:scale-[0.98] transition-transform duration-100"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={async () => {
                  const target = confirmRemove;
                  setConfirmRemove(null);
                  await cascadeRemove(target.field, target.ymd, target.leaves);
                }}
                disabled={busy}
                className={`flex-1 py-2.5 rounded-lg bg-red text-white text-sm font-bold border-none font-[inherit] shadow-[0_3px_10px_rgba(192,57,43,0.25)] inline-flex items-center justify-center gap-1.5 ${busy ? "opacity-60 cursor-wait" : "cursor-pointer"}`}
              >
                {busy && <Spinner size={14} />}
                {busy ? "กำลังลบ..." : "ลบใบลา + ลบวัน"}
              </button>
            </div>
          </div>
        </BaseModal>
      )}
    </div>
  );
}
