import {
  Briefcase as IconBriefcase,
  CalendarDays as IconCalendar,
  CalendarRange as IconCalendarRange,
  Cross as IconCross,
  Sun as IconSun,
} from "lucide-react";
import { useMemo, useState } from "react";
import { BUSINESS_RULES, COLORS } from "../../constants";
import type { Employee, LeaveEntry, StoreCalendar } from "../../types";
import { fmtDateWithWeekday, todayYmd } from "../../utils/dateUtils";
import {
  getCountedLeaveDays,
  getLeaveDeduction,
  leaveOverlapsMonth,
} from "../../utils/leaveUtils";
import {
  getPeriodRange,
  isCalendarMonth,
  type LeavePeriod,
  type PeriodCutoffs,
  periodKeyForDate,
  periodKeysForLeaves,
} from "../../utils/payrollPeriod";
import AvatarCircle from "../shared/AvatarCircle";
import DeductionSummary from "../shared/DeductionSummary";
import MonthChevronNav from "../shared/MonthChevronNav";
import ThemedSelect from "../shared/ThemedSelect";

/** จำนวนวันลาของประเภทหนึ่ง ภายในช่วงที่กำหนด
 *  ต้อง clamp ด้วย period เหมือนตัวเลขอื่นในการ์ด — ใช้ `lv.days` ตรง ๆ
 *  ไม่ได้ เพราะนั่นคือความยาวเต็มใบ ใบลาคร่อมรอบจะถูกนับเต็มในทั้งสองรอบ */
function typeDaysInPeriod(
  leaves: LeaveEntry[],
  type: LeaveEntry["type"],
  calendar: StoreCalendar,
  period: LeavePeriod,
): number {
  const { weekdays, sundays } = getCountedLeaveDays(
    leaves.filter((lv) => lv.type === type),
    calendar,
    period,
  );
  return weekdays + sundays;
}

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

interface LeaveSummaryPanelProps {
  allLeaves: LeaveEntry[];
  employeeDirectory: Employee[];
  storeCalendar: StoreCalendar;
  /** วันตัดรอบของรอบที่ปิดไปแล้ว — กำหนดว่าแต่ละรอบกินวันไหนถึงวันไหน */
  periodCutoffs: PeriodCutoffs;
  /** รอบที่ดู (YYYY-MM) — controlled โดย AdminPanel · share กับ section
   *  อื่น (LeaveListPanel · PeriodSettlementPanel) */
  selectedMonth: string;
  onSelectMonth: (month: string) => void;
}

/* ─── Admin: Leave Summary (รายเดือน + รายปี) ──────────────────── */
export default function LeaveSummaryPanel({
  allLeaves,
  employeeDirectory,
  storeCalendar,
  periodCutoffs,
  selectedMonth,
  onSelectMonth,
}: LeaveSummaryPanelProps) {
  const today = todayYmd();
  const [selYear, setSelYear] = useState(today.slice(0, 4));
  // key = `${empId}:${type}` — chip ที่ถูกกดให้แสดงรายการวัน
  const [expandedChip, setExpandedChip] = useState<string | null>(null);

  // รอบที่เลือกดูได้ = รอบที่มีใบลา ∪ รอบของวันนี้ ∪ รอบที่กำลังดู
  // ต้องแปลงใบลาเป็น key ของ "รอบ" ไม่ใช่เดือนปฏิทินของ lv.start — ไม่งั้น
  // รอบที่กำลังสะสมอยู่จะหายจากลิสต์ (ดู periodKeysForLeaves)
  const months = useMemo(
    () =>
      periodKeysForLeaves(allLeaves, periodCutoffs, [
        selectedMonth,
        periodKeyForDate(today, periodCutoffs),
      ]),
    [allLeaves, periodCutoffs, selectedMonth, today],
  );
  const effectiveMonth = months.includes(selectedMonth)
    ? selectedMonth
    : months[0];

  /* ─── รอบจ่ายของเดือนที่กำลังดู ─────────────────────────────────
     รอบ = ตั้งแต่วันถัดจากวันตัดของเดือนก่อน → วันตัดของเดือนนี้
     เดือนที่ยังไม่ปิด ใช้สิ้นเดือนเป็นขอบชั่วคราว                        */
  const period = useMemo(
    () => getPeriodRange(effectiveMonth, periodCutoffs),
    [effectiveMonth, periodCutoffs],
  );
  const periodIsPlainMonth = isCalendarMonth(effectiveMonth, period);

  /* ปีที่ดูในสรุปรายปี — ใช้เป็น period เต็มปี เพื่อ clamp ใบลาคร่อมปี */
  const yearPeriod = useMemo(
    () => ({ start: `${selYear}-01-01`, end: `${selYear}-12-31` }),
    [selYear],
  );

  // ปีที่มีใบลา ∪ ปีนี้ — เอาทั้ง start และ end เพราะใบลาคร่อมปีใหม่
  // จะมีแต่ปีเก่าถ้าดูแค่ start
  const years: string[] = [
    ...new Set([
      today.slice(0, 4),
      ...allLeaves.flatMap((lv) => [lv.start.slice(0, 4), lv.end.slice(0, 4)]),
    ]),
  ]
    .sort()
    .reverse();

  return (
    <div>
      {/* Monthly summary */}
      <div className="bg-white rounded-2xl p-4 mb-3.5 shadow-[0_2px_10px_rgba(90,30,10,0.06)] border border-bdr">
        <div className="flex items-center justify-between mb-3.5">
          <div className="font-bold text-maroon text-base flex items-center gap-1.5">
            <IconCalendar size={16} strokeWidth={2.4} />
            {periodIsPlainMonth ? "สรุปลาเดือนนี้" : "สรุปลารอบนี้"}
          </div>
          <MonthChevronNav
            months={months}
            selected={effectiveMonth}
            onSelect={onSelectMonth}
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
              const monthLeaves = allLeaves.filter(
                (lv) =>
                  lv.employeeId === empId && leaveOverlapsMonth(lv, period),
              );
              const totalTimes = monthLeaves.length;
              if (totalTimes === 0) return null;
              // ต้อง clamp ด้วย period เหมือนยอดหักด้านล่าง — ไม่งั้นใบลา
              // คร่อมรอบจะโชว์จำนวนวันเต็มใบในทั้งสองรอบ ไม่ตรงกับยอดหัก
              const { weekdays, sundays } = getCountedLeaveDays(
                monthLeaves,
                storeCalendar,
                period,
              );
              const totalDays = weekdays + sundays;
              const personalDays = typeDaysInPeriod(
                monthLeaves,
                "personal",
                storeCalendar,
                period,
              );
              const sickDays = typeDaysInPeriod(
                monthLeaves,
                "sick",
                storeCalendar,
                period,
              );
              // ยอดหักของคนนี้ในรอบนี้ — clamp ด้วย period เพื่อให้ใบลา
              // คร่อมรอบคิดเฉพาะวันของรอบที่กำลังดู
              const deduction = getLeaveDeduction(
                monthLeaves,
                storeCalendar,
                period,
              );
              // แดงเมื่อมียอดหักจริง (ลาในโควต้ายังไม่ถูกหัก จึงไม่แดง)
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
          {/* ต้องใช้ filter เดียวกับลิสต์ข้างบน — เดิมเช็คด้วย
              startsWith(effectiveMonth) ทำให้ใบลาที่ยกไปรอบถัดไปโชว์การ์ด
              พร้อมข้อความ "ไม่มีการลา" ใต้การ์ดตัวเอง */}
          {allLeaves.filter((lv) => leaveOverlapsMonth(lv, period)).length ===
            0 && (
            <div className="text-txt-soft text-sm text-center py-4">
              {periodIsPlainMonth ? "ไม่มีการลาในเดือนนี้" : "ไม่มีการลาในรอบนี้"}
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
                (lv) =>
                  lv.employeeId === empId && leaveOverlapsMonth(lv, yearPeriod),
              );
              const totalTimes = yearLeaves.length;
              if (totalTimes === 0) return null;
              const { weekdays, sundays } = getCountedLeaveDays(
                yearLeaves,
                storeCalendar,
                yearPeriod,
              );
              const totalDays = weekdays + sundays;
              const personalDays = typeDaysInPeriod(
                yearLeaves,
                "personal",
                storeCalendar,
                yearPeriod,
              );
              const sickDays = typeDaysInPeriod(
                yearLeaves,
                "sick",
                storeCalendar,
                yearPeriod,
              );
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
