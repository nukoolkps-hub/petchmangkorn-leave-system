import {
  Briefcase as IconBriefcase,
  CalendarDays as IconCalendar,
  CalendarRange as IconCalendarRange,
  Cross as IconCross,
  Sun as IconSun,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { BUSINESS_RULES, COLORS } from "../../constants";
import type { Employee, LeaveEntry, StoreCalendar } from "../../types";
import { fmtDateWithWeekday, todayYmd, toYMD } from "../../utils/dateUtils";
import { getLeaveDeduction, leaveOverlapsMonth } from "../../utils/leaveUtils";
import {
  getPeriodRange,
  isCalendarMonth,
  isPeriodClosed,
  type LeavePeriod,
  type PeriodCutoffs,
} from "../../utils/payrollPeriod";
import {
  buildSettlement,
  diffSettlement,
  makeSnapshot,
  type PeriodSnapshot,
  type PeriodSnapshots,
} from "../../utils/periodSettlement";
import AvatarCircle from "../shared/AvatarCircle";
import DeductionSummary from "../shared/DeductionSummary";
import MonthChevronNav from "../shared/MonthChevronNav";
import ThemedSelect from "../shared/ThemedSelect";
import PayrollPeriodBar from "./PayrollPeriodBar";
import PeriodSettlementTable from "./PeriodSettlementTable";

/* ─── แสดง breakdown วันธรรมดา/อาทิตย์ บรรทัดเดียว ใต้ยอดรวมวันลา ──── */
function LeaveDayBreakdown({
  weekdays,
  sundays,
}: {
  weekdays: number;
  sundays: number;
}) {
  if (weekdays <= 0 && sundays <= 0) return null;
  return (
    <div className="text-[11px] text-txt-soft font-medium mt-0.5 leading-snug whitespace-nowrap flex flex-col items-end gap-0.5">
      {weekdays > 0 && (
        <span className="inline-flex items-center gap-1">
          <IconCalendarRange size={10} strokeWidth={2.4} />
          วันธรรมดา × {weekdays}
        </span>
      )}
      {sundays > 0 && (
        <span className="inline-flex items-center gap-1">
          <IconSun size={10} strokeWidth={2.4} />
          วันอาทิตย์ × {sundays}
          <span className="opacity-70">
            (−{BUSINESS_RULES.SUNDAY_LEAVE_DEDUCTION})
          </span>
        </span>
      )}
    </div>
  );
}

// นับวันธรรมดา/อาทิตย์ในช่วงวันลา — เคารพ storeCalendar เดียวกับ countWorkdays
// (เสาร์เปิดพิเศษ → นับเป็น weekday · จ-ศ ปิดพิเศษ → ข้าม · อาทิตย์ปิดพิเศษ → ข้าม)
// ไม่งั้น breakdown จะไม่ตรงกับ lv.days (badge "ลา N วัน") ที่นับด้วย countWorkdays
function countByDayType(
  start: string,
  end: string,
  calendar?: StoreCalendar | null,
) {
  let weekdays = 0;
  let sundays = 0;
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  const c = new Date(s);
  const extraOpenSat = new Set(calendar?.extraOpenSaturdays || []);
  const extraClosedWd = new Set(calendar?.extraClosedWeekdays || []);
  const extraClosedSun = new Set(calendar?.extraClosedSundays || []);
  while (c <= e) {
    const dow = c.getDay();
    const ymd = toYMD(c);
    if (dow === 0) {
      if (!extraClosedSun.has(ymd)) sundays++;
    } else if (dow === 6) {
      if (extraOpenSat.has(ymd)) weekdays++;
    } else {
      if (!extraClosedWd.has(ymd)) weekdays++;
    }
    c.setDate(c.getDate() + 1);
  }
  return { weekdays, sundays };
}
function sumDayType(leaves: LeaveEntry[], calendar?: StoreCalendar | null) {
  let weekdays = 0;
  let sundays = 0;
  leaves.forEach((lv) => {
    const r = countByDayType(lv.start, lv.end, calendar);
    weekdays += r.weekdays;
    sundays += r.sundays;
  });
  return { weekdays, sundays };
}

interface LeaveSummaryPanelProps {
  allLeaves: LeaveEntry[];
  employeeDirectory: Employee[];
  storeCalendar: StoreCalendar;
  /** วันตัดรอบของเดือนที่ปิดไปแล้ว — กำหนดว่าแต่ละรอบกินวันไหนถึงวันไหน */
  periodCutoffs: PeriodCutoffs;
  /** ยอดที่ล็อกไว้ตอนปิดรอบ — รอบที่ปิดแล้วโชว์ชุดนี้แทนยอดสด */
  periodSnapshots: PeriodSnapshots;
  onClosePeriod: (
    yearMonth: string,
    cutoffYmd: string,
    snapshot: PeriodSnapshot,
  ) => Promise<void>;
  onReopenPeriod: (yearMonth: string) => Promise<void>;
  onRelockPeriod: (
    yearMonth: string,
    snapshot: PeriodSnapshot,
  ) => Promise<void>;
  showToast: (msg: string) => void;
  /** เดือนที่ดู (YYYY-MM) — controlled โดย AdminPanel · share กับ section
   *  อื่น (LeaveListPanel) */
  selectedMonth: string;
  onSelectMonth: (month: string) => void;
}

/* ─── Admin: Leave Summary (รายเดือน + รายปี) ──────────────────── */
export default function LeaveSummaryPanel({
  allLeaves,
  employeeDirectory,
  storeCalendar,
  periodCutoffs,
  periodSnapshots,
  onClosePeriod,
  onReopenPeriod,
  onRelockPeriod,
  showToast,
  selectedMonth,
  onSelectMonth,
}: LeaveSummaryPanelProps) {
  const today = todayYmd();
  const currentMonth = today.slice(0, 7);
  const [selYear, setSelYear] = useState(today.slice(0, 4));
  // key = `${empId}:${type}` — chip ที่ถูกกดให้แสดงรายการวัน
  const [expandedChip, setExpandedChip] = useState<string | null>(null);

  // months = เดือนที่กำลังดู ∪ เดือนที่มีใบลา · เรียงใหม่→เก่า
  // โชว์เฉพาะเดือนที่มีข้อมูล (ไม่ยัดเดือนปัจจุบันที่ว่าง) · selectedMonth คงไว้
  // เสมอ → effectiveMonth = selectedMonth ตรงๆ
  const months: string[] = useMemo(
    () =>
      [
        ...new Set([
          selectedMonth,
          ...(allLeaves.map((lv) => lv.start.slice(0, 7)) as string[]),
        ]),
      ]
        .sort()
        .reverse(),
    [allLeaves, selectedMonth],
  );
  const effectiveMonth = months.includes(selectedMonth)
    ? selectedMonth
    : currentMonth;
  /* ─── รอบจ่ายของเดือนที่กำลังดู ─────────────────────────────────
     รอบ = ตั้งแต่วันถัดจากวันตัดของเดือนก่อน → วันตัดของเดือนนี้
     เดือนที่ยังไม่ปิด ใช้สิ้นเดือนเป็นขอบชั่วคราว                        */
  const period = useMemo(
    () => getPeriodRange(effectiveMonth, periodCutoffs),
    [effectiveMonth, periodCutoffs],
  );
  const periodClosed = isPeriodClosed(effectiveMonth, periodCutoffs);
  const periodIsPlainMonth = isCalendarMonth(effectiveMonth, period);

  /* ยอด "สด" ของรอบที่กำลังดู — คิดจากใบลา + ปฏิทินร้าน ณ ตอนนี้ */
  const live = useMemo(
    () => buildSettlement(employeeDirectory, allLeaves, storeCalendar, period),
    [allLeaves, employeeDirectory, storeCalendar, period],
  );

  /* ยอดที่ล็อกไว้ตอนปิดรอบ — ถ้ามี ให้ถือว่านี่คือยอดทางการของรอบนั้น
     (ยอดสดยังคิดต่อไปเพื่อเอามาเทียบว่ามีอะไรขยับหลังปิดรอบไหม)        */
  const snapshot = periodSnapshots[effectiveMonth];
  // ช่วงวันที่โชว์คู่กับยอด ต้องเป็นช่วงที่ "ยอดชุดนั้น" คิดมา — ไม่งั้นถ้า
  // ขอบรอบขยับทีหลัง หัวข้อความที่คัดลอกไปจะไม่ตรงกับตัวเลขข้างใต้
  const shown = snapshot
    ? {
        rows: snapshot.rows,
        totals: snapshot.totals,
        range: { start: snapshot.start, end: snapshot.end },
      }
    : { ...live, range: period };
  const drift = useMemo(
    () => (snapshot ? diffSettlement(snapshot, live) : []),
    [snapshot, live],
  );

  /* ปิดรอบ = ล็อกยอด ณ ตอนนั้นไปพร้อมกัน
     ⚠️ ต้องคิดยอดด้วยขอบรอบ "หลังปิด" (end = วันตัดที่เลือก) ไม่ใช่ขอบ
     ชั่วคราวสิ้นเดือนที่โชว์อยู่ตอนรอบยังเปิด — ไม่งั้นวันลาหลังวันตัด
     จะถูกล็อกติดมาในรอบที่จ่ายไปแล้ว                                     */
  const settlementFor = useCallback(
    (range: LeavePeriod) =>
      buildSettlement(employeeDirectory, allLeaves, storeCalendar, range),
    [employeeDirectory, allLeaves, storeCalendar],
  );

  const handleClosePeriod = useCallback(
    async (yearMonth: string, cutoffYmd: string) => {
      const closedRange = {
        start: getPeriodRange(yearMonth, periodCutoffs).start,
        end: cutoffYmd,
      };
      await onClosePeriod(
        yearMonth,
        cutoffYmd,
        makeSnapshot(yearMonth, closedRange, settlementFor(closedRange)),
      );
    },
    [onClosePeriod, periodCutoffs, settlementFor],
  );

  const handleRelockPeriod = useCallback(
    () =>
      onRelockPeriod(
        effectiveMonth,
        makeSnapshot(effectiveMonth, period, live),
      ),
    [onRelockPeriod, effectiveMonth, period, live],
  );

  const years: string[] = (
    [...new Set(allLeaves.map((lv) => lv.start.slice(0, 4)))] as string[]
  )
    .sort()
    .reverse();

  return (
    <div>
      {/* Monthly summary */}
      <div className="bg-white rounded-2xl p-4 mb-3.5 shadow-[0_2px_10px_rgba(90,30,10,0.06)] border border-bdr">
        <div className="flex items-center justify-between mb-3.5">
          <div className="font-bold text-maroon text-base flex items-center gap-1.5">
            <IconCalendar size={16} strokeWidth={2.4} />
            สรุปรอบจ่าย
          </div>
          <MonthChevronNav
            months={months}
            selected={effectiveMonth}
            onSelect={onSelectMonth}
          />
        </div>
        <PayrollPeriodBar
          yearMonth={effectiveMonth}
          period={period}
          closed={periodClosed}
          plainMonth={periodIsPlainMonth}
          lockedAt={snapshot?.closedAt}
          onClose={handleClosePeriod}
          onReopen={onReopenPeriod}
          showToast={showToast}
        />
        <PeriodSettlementTable
          rows={shown.rows}
          period={shown.range}
          totals={shown.totals}
          locked={Boolean(snapshot)}
          lockedAt={snapshot?.closedAt}
          drift={drift}
          onRelock={handleRelockPeriod}
          showToast={showToast}
        />
        {employeeDirectory.length === 0 && (
          <div className="text-txt-soft text-sm text-center py-4">ไม่มีข้อมูล</div>
        )}
        <div className="flex flex-col gap-2">
          {employeeDirectory
            .map((employeeInfo) => {
              const empId = employeeInfo.id;
              const name = employeeInfo.nickname || employeeInfo.name;
              const monthLeaves = allLeaves.filter(
                (lv) =>
                  lv.employeeId === empId && leaveOverlapsMonth(lv, period),
              );
              const totalTimes = monthLeaves.length;
              if (totalTimes === 0) return null;
              const { weekdays, sundays } = sumDayType(
                monthLeaves,
                storeCalendar,
              );
              const totalDays = weekdays + sundays;
              const personalDays = monthLeaves
                .filter((lv) => lv.type === "personal")
                .reduce((s, lv) => s + lv.days, 0);
              const sickDays = monthLeaves
                .filter((lv) => lv.type === "sick")
                .reduce((s, lv) => s + lv.days, 0);
              // ยอดหักของคนนี้ในรอบนี้ — clamp ด้วย period เพื่อให้ใบลา
              // คร่อมรอบคิดเฉพาะวันของรอบที่กำลังดู
              const deduction = getLeaveDeduction(
                monthLeaves,
                storeCalendar,
                period,
              );
              // ไม่มีโควต้าวันฟรีแล้ว — แดงเมื่อมียอดหักจริง
              const hasDeduction = deduction.total > 0;
              return (
                <div
                  key={empId}
                  className={`px-3.5 py-3 rounded-xl border ${hasDeduction ? "bg-red-lt border-[#C0392B30]" : "bg-cream border-bdr"}`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <AvatarCircle
                      avatar={employeeInfo?.avatar || name.slice(0, 2)}
                      avatarType={employeeInfo?.avatarType || "text"}
                      avatarImageUrl={employeeInfo?.avatarImageUrl || null}
                      size={36}
                      fontSize={12}
                      border={`2px solid ${COLORS.gold}40`}
                    />
                    <div className="flex-1">
                      <div className="font-bold text-txt text-sm">{name}</div>
                      <div className="text-xs text-txt-soft">
                        {employeeInfo?.role || "-"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className={`font-extrabold text-lg ${hasDeduction ? "text-red" : "text-maroon"}`}
                      >
                        {totalDays}{" "}
                        <span className="text-xs font-medium text-txt-soft">
                          วัน
                        </span>
                      </div>
                      <LeaveDayBreakdown
                        weekdays={weekdays}
                        sundays={sundays}
                      />
                      <DeductionSummary
                        deduction={deduction}
                        variant="compact"
                      />
                    </div>
                  </div>
                  <div className="flex gap-1.5 flex-wrap items-center">
                    {personalDays > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedChip((prev) =>
                            prev === `${empId}:personal`
                              ? null
                              : `${empId}:personal`,
                          )
                        }
                        className={`rounded-[20px] px-2.5 py-1 text-sm font-semibold bg-[#DDEEFF] text-[#1E40AF] cursor-pointer font-[inherit] border inline-flex items-center gap-1 ${expandedChip === `${empId}:personal` ? "border-[#A8C8F0]" : "border-transparent"}`}
                      >
                        <IconBriefcase size={12} strokeWidth={2.4} />
                        ลากิจ {personalDays} วัน
                      </button>
                    )}
                    {sickDays > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedChip((prev) =>
                            prev === `${empId}:sick` ? null : `${empId}:sick`,
                          )
                        }
                        className={`rounded-[20px] px-2.5 py-1 text-sm font-semibold bg-[#CCFBF1] text-[#0F766E] cursor-pointer font-[inherit] border inline-flex items-center gap-1 ${expandedChip === `${empId}:sick` ? "border-[#0F766E]" : "border-transparent"}`}
                      >
                        <IconCross size={12} strokeWidth={2.4} />
                        ลาป่วย {sickDays} วัน
                      </button>
                    )}
                  </div>
                  {expandedChip?.startsWith(`${empId}:`) && (
                    <div className="mt-2 pl-2.5 text-xs text-txt-mid border-l-2 border-gold/40 flex flex-col gap-0.5">
                      {monthLeaves
                        .filter((lv) => lv.type === expandedChip.split(":")[1])
                        .sort((a, b) => a.start.localeCompare(b.start))
                        .map((lv) => (
                          <div key={lv.id} className="flex items-center gap-1">
                            <IconCalendar size={11} strokeWidth={2.4} />
                            {fmtDateWithWeekday(lv.start)}
                            {lv.start !== lv.end
                              ? ` - ${fmtDateWithWeekday(lv.end)}`
                              : ""}{" "}
                            <span className="text-txt-soft">
                              ({lv.days} วัน)
                            </span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              );
            })
            .filter(Boolean)}
          {employeeDirectory.every(
            (emp) =>
              allLeaves.filter(
                (lv) =>
                  lv.employeeId === emp.id &&
                  lv.start.startsWith(effectiveMonth),
              ).length === 0,
          ) && (
            <div className="text-txt-soft text-sm text-center py-4">
              ไม่มีการลาในเดือนนี้
            </div>
          )}
        </div>
      </div>

      {/* Yearly summary */}
      <div className="bg-white rounded-2xl p-4 shadow-[0_2px_10px_rgba(90,30,10,0.06)] border border-bdr">
        <div className="flex items-center justify-between mb-3.5">
          <div className="font-bold text-maroon text-base flex items-center gap-1.5">
            <IconCalendar size={16} strokeWidth={2.4} />
            สรุปรายปี
          </div>
          <ThemedSelect
            value={selYear}
            onChange={setSelYear}
            options={years.map((y) => ({
              value: y,
              label: `ปี ${parseInt(y, 10) + 543}`,
            }))}
            className="inline-flex items-center pl-2.5 pr-7 py-1.5 rounded-lg border border-bdr text-sm text-txt bg-cream font-[inherit] cursor-pointer text-left"
          />
        </div>
        {employeeDirectory.length === 0 && (
          <div className="text-txt-soft text-sm text-center py-4">ไม่มีข้อมูล</div>
        )}
        <div className="flex flex-col gap-2">
          {employeeDirectory
            .map((employeeInfo) => {
              const empId = employeeInfo.id;
              const name = employeeInfo.nickname || employeeInfo.name;
              const yearLeaves = allLeaves.filter(
                (lv) => lv.employeeId === empId && lv.start.startsWith(selYear),
              );
              const totalTimes = yearLeaves.length;
              if (totalTimes === 0) return null;
              const { weekdays, sundays } = sumDayType(
                yearLeaves,
                storeCalendar,
              );
              const totalDays = weekdays + sundays;
              const personalDays = yearLeaves
                .filter((lv) => lv.type === "personal")
                .reduce((s, lv) => s + lv.days, 0);
              const sickDays = yearLeaves
                .filter((lv) => lv.type === "sick")
                .reduce((s, lv) => s + lv.days, 0);
              const barPct = Math.min(100, (totalDays / 30) * 100);
              return (
                <div
                  key={empId}
                  className="p-3.5 rounded-xl bg-cream border border-bdr"
                >
                  <div className="flex items-center gap-3 mb-2.5">
                    <AvatarCircle
                      avatar={employeeInfo?.avatar || name.slice(0, 2)}
                      avatarType={employeeInfo?.avatarType || "text"}
                      avatarImageUrl={employeeInfo?.avatarImageUrl || null}
                      size={38}
                      fontSize={12}
                      border={`2px solid ${COLORS.gold}40`}
                    />
                    <div className="flex-1">
                      <div className="font-bold text-txt text-sm">{name}</div>
                      <div className="text-sm text-txt-soft">
                        {employeeInfo?.role || "-"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-extrabold text-xl text-maroon">
                        {totalDays}{" "}
                        <span className="text-xs font-medium text-txt-soft">
                          วัน
                        </span>
                      </div>
                      <LeaveDayBreakdown
                        weekdays={weekdays}
                        sundays={sundays}
                      />
                    </div>
                  </div>
                  <div className="bg-cream-dk rounded-md h-[7px] overflow-hidden mb-2.5">
                    <div
                      className="h-full rounded-md bg-linear-to-r from-gold to-gold-lt"
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                  <div className="flex gap-1.5 flex-wrap items-center">
                    {personalDays > 0 && (
                      <div className="rounded-[20px] px-2.5 py-1 text-sm font-semibold bg-[#DDEEFF] text-[#1E40AF] inline-flex items-center gap-1">
                        <IconBriefcase size={12} strokeWidth={2.4} />
                        ลากิจ {personalDays} วัน
                      </div>
                    )}
                    {sickDays > 0 && (
                      <div className="rounded-[20px] px-2.5 py-1 text-sm font-semibold bg-[#CCFBF1] text-[#0F766E] inline-flex items-center gap-1">
                        <IconCross size={12} strokeWidth={2.4} />
                        ลาป่วย {sickDays} วัน
                      </div>
                    )}
                  </div>
                </div>
              );
            })
            .filter(Boolean)}
          {employeeDirectory.every(
            (emp) =>
              allLeaves.filter(
                (lv) =>
                  lv.employeeId === emp.id && lv.start.startsWith(selYear),
              ).length === 0,
          ) && (
            <div className="text-txt-soft text-sm text-center py-4">
              ไม่มีการลาในปีนี้
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
