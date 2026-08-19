import {
  ChevronLeft as IconChevronLeft,
  ChevronRight as IconChevronRight,
  Lock as IconLock,
  Sparkles as IconSparkles,
  Store as IconStore,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import {
  COLORS as colors,
  LEAVE_TYPES,
  THAI_MONTH_SHORT_NAMES,
  TODAY,
  THAI_MONTH_NAMES as thaiMonthNames,
  THAI_SHORT_WEEKDAY_NAMES as thaiShortDayNames,
} from "../../constants";
import { useClickOutside } from "../../hooks/useClickOutside";
import type { Employee, LeaveEntry, StoreCalendar } from "../../types";
import { dateRange, toYMD as toDateKey } from "../../utils/dateUtils";
import { isStoreClosed } from "../../utils/storeCalendar";
import AvatarCircle from "../shared/AvatarCircle";
import {
  CAL_NAV_BTN,
  CAL_OPTION_IDLE,
  CAL_OPTION_SELECTED,
  CAL_SELECTED_DAY_BG,
  CAL_SELECTED_DAY_BORDER,
  CAL_SELECTED_DAY_SHADOW,
  CAL_SELECTED_DAY_TEXT,
  CAL_TODAY_BG,
  CAL_TODAY_BORDER,
  CAL_TODAY_TEXT,
  calWeekdayClass,
} from "../shared/calendarTheme";

type CalendarEmployee = Pick<
  Employee,
  "id" | "name" | "nickname" | "avatar" | "avatarType" | "avatarImageUrl"
>;

interface TeamCalendarProps {
  leaveEntries: LeaveEntry[];
  employeeDirectory: CalendarEmployee[];
  storeCalendar?: StoreCalendar | null;
  /** id ของพนักงานที่กำลังดู — ใช้แยก "ของตัวเอง" กับ "ของคนอื่น" ในจุดวันลา
   *  · null/undefined (เช่นฝั่ง admin) → ทุกดอตทึบเหมือนเดิม ไม่ highlight ตัวเอง */
  myEmployeeId?: string | null;
}

/* ─── Team Calendar ────────────────────────────────────────────── */
export default function TeamCalendar({
  leaveEntries,
  employeeDirectory,
  storeCalendar,
  myEmployeeId,
}: TeamCalendarProps) {
  const now = new Date();
  const [visibleYear, setVisibleYear] = useState(now.getFullYear());
  const [visibleMonth, setVisibleMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState<string>(TODAY);
  // popover เลือกเดือน/ปีเมื่อแตะ label
  const [pickerOpen, setPickerOpen] = useState(false);
  // ปีที่กำลังโชว์ใน popover · sync กับ visibleYear ตอนเปิด
  const [pickerYear, setPickerYear] = useState(visibleYear);
  const pickerRef = useRef<HTMLDivElement>(null);
  useClickOutside(pickerRef, () => setPickerOpen(false), pickerOpen);

  function showPreviousMonth() {
    if (visibleMonth === 0) {
      setVisibleMonth(11);
      setVisibleYear((year) => year - 1);
    } else {
      setVisibleMonth((month) => month - 1);
    }
  }

  function showNextMonth() {
    if (visibleMonth === 11) {
      setVisibleMonth(0);
      setVisibleYear((year) => year + 1);
    } else {
      setVisibleMonth((month) => month + 1);
    }
  }

  function selectDate(dateKey: string) {
    if (dateKey === selectedDate) return;
    setSelectedDate(dateKey);
  }

  const daysInVisibleMonth = new Date(
    visibleYear,
    visibleMonth + 1,
    0,
  ).getDate();
  const firstDayOfVisibleMonth = new Date(
    visibleYear,
    visibleMonth,
    1,
  ).getDay();
  const calendarCells = [
    ...Array(firstDayOfVisibleMonth).fill(null),
    ...Array.from(
      { length: daysInVisibleMonth },
      (_, dayIndex) => dayIndex + 1,
    ),
  ];

  // memo บน leaveEntries — กัน rebuild ตอนแตะวันหรือเปิด popover เลือกเดือน
  // (ใบลาช่วงยาวจะ allocate array ทุกวันใน range ทุก render ถ้าไม่ memo)
  const leavesByDate = useMemo(() => {
    const out: Record<string, LeaveEntry[]> = {};
    for (const leaveEntry of leaveEntries) {
      for (const dateKey of dateRange(leaveEntry.start, leaveEntry.end)) {
        if (!out[dateKey]) out[dateKey] = [];
        out[dateKey].push(leaveEntry);
      }
    }
    return out;
  }, [leaveEntries]);
  const selectedDateLeaves = leavesByDate[selectedDate] || [];

  return (
    <div>
      <div className="bg-white rounded-[18px] px-4 pt-4.5 pb-4 shadow-[0_2px_14px_rgba(90,30,10,0.08)] border border-bdr mb-3.5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="font-bold text-maroon text-lg">ปฏิทินการลา</div>
            <div className="text-sm text-txt-soft mt-0.5">
              แตะวันเพื่อดูรายละเอียด
            </div>
          </div>
          <div ref={pickerRef} className="relative flex items-center gap-2">
            <button onClick={showPreviousMonth} className={CAL_NAV_BTN}>
              <IconChevronLeft
                size={12}
                color={colors.textMedium}
                strokeWidth={2.5}
              />
            </button>
            <button
              type="button"
              onClick={() => {
                setPickerYear(visibleYear);
                setPickerOpen((v) => !v);
              }}
              className="text-sm font-semibold text-txt min-w-[108px] text-center px-2.5 py-1.5 rounded-lg border border-bdr bg-cream cursor-pointer font-[inherit]"
            >
              {thaiMonthNames[visibleMonth]} {visibleYear + 543}
            </button>
            <button onClick={showNextMonth} className={CAL_NAV_BTN}>
              <IconChevronRight
                size={12}
                color={colors.textMedium}
                strokeWidth={2.5}
              />
            </button>

            {pickerOpen && (
              <div className="absolute z-20 top-full right-0 mt-1.5 w-[208px] rounded-[12px] border-[1.5px] border-bdr bg-white p-2 shadow-[0_8px_24px_rgba(90,30,10,0.14)] animate-[calFade_0.13s_ease-out] origin-top">
                {/* year header */}
                <div className="flex items-center justify-between mb-1.5 px-1">
                  <button
                    type="button"
                    aria-label="ปีก่อนหน้า"
                    onClick={() => setPickerYear((y) => y - 1)}
                    className="w-6 h-6 rounded-md border border-bdr bg-cream cursor-pointer flex items-center justify-center"
                  >
                    <IconChevronLeft
                      size={11}
                      color={colors.textMedium}
                      strokeWidth={2.5}
                    />
                  </button>
                  <span className="text-sm font-bold text-maroon">
                    ปี {pickerYear + 543}
                  </span>
                  <button
                    type="button"
                    aria-label="ปีถัดไป"
                    onClick={() => setPickerYear((y) => y + 1)}
                    className="w-6 h-6 rounded-md border border-bdr bg-cream cursor-pointer flex items-center justify-center"
                  >
                    <IconChevronRight
                      size={11}
                      color={colors.textMedium}
                      strokeWidth={2.5}
                    />
                  </button>
                </div>
                {/* months 3-col grid · short names */}
                <div className="grid grid-cols-3 gap-1">
                  {THAI_MONTH_SHORT_NAMES.map((label, i) => {
                    const isSel =
                      pickerYear === visibleYear && i === visibleMonth;
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => {
                          setVisibleYear(pickerYear);
                          setVisibleMonth(i);
                          setPickerOpen(false);
                        }}
                        className={`py-2 px-1 rounded-[8px] text-sm font-semibold cursor-pointer font-[inherit] transition-colors ${
                          isSel ? CAL_OPTION_SELECTED : CAL_OPTION_IDLE
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-7 mb-1.5">
          {thaiShortDayNames.map((dayName, dayIndex) => (
            <div key={dayName} className={calWeekdayClass(dayIndex === 6)}>
              {dayName}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-[3px]">
          {calendarCells.map((dayOfMonth, cellIndex) => {
            if (!dayOfMonth) {
              return (
                <div
                  key={`blank-${visibleYear}-${visibleMonth}-${cellIndex}`}
                  className="min-h-[50px]"
                  aria-hidden="true"
                />
              );
            }

            const date = new Date(visibleYear, visibleMonth, dayOfMonth);
            const dateKey = toDateKey(date);
            const dayOfWeek = date.getDay();
            const isWeekend = dayOfWeek === 6;
            const isToday = dateKey === TODAY;
            const isSelectedDate = dateKey === selectedDate;
            const leaveEntriesForDate = leavesByDate[dateKey] || [];
            const hasLeaveEntries = leaveEntriesForDate.length > 0;
            // ปฏิทินเปิด-ปิดร้าน: เสาร์ default ปิด · admin เปิดบางเสาร์/ปิด จ-ศ บางวันได้
            const storeClosed = isStoreClosed(dateKey, storeCalendar);
            const isExtraOpenSat =
              dayOfWeek === 6 &&
              !!storeCalendar?.extraOpenSaturdays?.includes(dateKey);

            return (
              <div
                key={dateKey}
                onClick={() => selectDate(dateKey)}
                className="min-h-[62px] rounded-[10px] px-0.5 pt-[5px] pb-1 cursor-pointer transition-[background-color,border-color,box-shadow] duration-150"
                style={{
                  background: isSelectedDate
                    ? CAL_SELECTED_DAY_BG
                    : storeClosed
                      ? colors.creamDark
                      : isExtraOpenSat
                        ? colors.greenLight
                        : isToday
                          ? CAL_TODAY_BG
                          : colors.white,
                  border: `1.5px solid ${
                    isSelectedDate
                      ? CAL_SELECTED_DAY_BORDER
                      : isToday
                        ? CAL_TODAY_BORDER
                        : hasLeaveEntries
                          ? CAL_SELECTED_DAY_BORDER
                          : "transparent"
                  }`,
                  boxShadow:
                    isSelectedDate || hasLeaveEntries
                      ? CAL_SELECTED_DAY_SHADOW
                      : "none",
                }}
              >
                <div
                  className="text-center text-sm leading-none"
                  style={{
                    fontWeight: isToday || isSelectedDate ? 800 : 500,
                    color: isSelectedDate
                      ? CAL_SELECTED_DAY_TEXT
                      : storeClosed
                        ? `${colors.textSoft}80`
                        : isExtraOpenSat
                          ? colors.green
                          : isWeekend
                            ? `${colors.textSoft}80`
                            : isToday
                              ? CAL_TODAY_TEXT
                              : colors.text,
                  }}
                >
                  {dayOfMonth}
                </div>
                {/* marker เปิด-ปิดร้าน (ขนาดเล็กใต้เลข)
                    "ปิด"/"เปิด" แสดงเฉพาะตอนไม่มีใบลา (จะถูก dot ทับ) */}
                {(storeClosed || isExtraOpenSat) && !hasLeaveEntries && (
                  <div
                    className="flex justify-center items-center mt-[2px] text-[8px] font-bold leading-none"
                    style={{
                      color: storeClosed ? colors.textSoft : colors.green,
                    }}
                  >
                    {storeClosed ? (
                      <span className="inline-flex items-center gap-px">
                        <IconLock size={7} strokeWidth={3} />
                        ปิด
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-px">
                        <IconStore size={7} strokeWidth={3} />
                        เปิด
                      </span>
                    )}
                  </div>
                )}
                {hasLeaveEntries && (
                  <div
                    className={`flex flex-wrap gap-px justify-center mt-[3px] ${
                      storeClosed ? "opacity-40" : ""
                    }`}
                    title={
                      storeClosed
                        ? "วันร้านปิด — ใบลาไม่นับโควต้า · ไม่หักเงิน"
                        : undefined
                    }
                  >
                    {leaveEntriesForDate.slice(0, 3).map((leaveEntry) => {
                      const leaveType = LEAVE_TYPES.find(
                        (type) => type.id === leaveEntry.type,
                      );
                      // lookup live record by employeeId (กันชื่อโดน rename) ·
                      // live nickname จากปัจจุบันใน directory ทับ snapshot ใน
                      // ใบลา (snapshot อาจเก่า) · fallback snapshot สำหรับ peer
                      // ที่พนักงานอ่าน directory ไม่ได้
                      const livePeer = employeeDirectory.find(
                        (e) => e.id === leaveEntry.employeeId,
                      );
                      const displayName =
                        livePeer?.nickname ||
                        leaveEntry.employeeNickname ||
                        livePeer?.name ||
                        leaveEntry.employeeName;
                      // ของตัวเอง = ดอตทึบ · ของคนอื่น = ดอตวงแหวน (สีเดียวกัน)
                      // myEmployeeId = null/undefined (admin) → ทุกอัน solid เหมือนเดิม
                      const dotColor = leaveType?.color || colors.gold;
                      const isOwn =
                        !!myEmployeeId &&
                        leaveEntry.employeeId === myEmployeeId;
                      const isSolid = isOwn || !myEmployeeId;
                      return (
                        <div
                          key={leaveEntry.id}
                          title={`${displayName}${isOwn ? " (คุณ)" : ""} (${leaveType?.label || leaveEntry.type})${storeClosed ? " · วันร้านปิด ไม่นับ" : ""}`}
                          className="w-2.5 h-2.5 rounded-full"
                          style={{
                            background: isSolid ? dotColor : "transparent",
                            border: isSolid
                              ? "1px solid white"
                              : `1.5px solid ${dotColor}`,
                            boxSizing: "border-box",
                          }}
                        />
                      );
                    })}
                    {leaveEntriesForDate.length > 3 && (
                      <div className="min-w-5 h-4 px-1 rounded-full bg-txt-soft flex items-center justify-center text-xs leading-none text-white font-bold">
                        +{leaveEntriesForDate.length - 3}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex gap-3.5 mt-3.5 pt-3 border-t border-cream-dk flex-wrap">
          {LEAVE_TYPES.map((lt) => (
            <div key={lt.id} className="flex items-center gap-1.5">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: lt.color }}
              />
              <span className="text-sm text-txt-soft">{lt.label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <div
              className="w-2.5 h-2.5 rounded-[3px] border border-bdr"
              style={{ background: colors.creamDark }}
            />
            <span className="text-sm text-txt-soft">ร้านปิด</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div
              className="w-2.5 h-2.5 rounded-[3px]"
              style={{ background: colors.greenLight }}
            />
            <span className="text-sm text-txt-soft">เสาร์เปิดพิเศษ</span>
          </div>
          {/* แยกของตัวเอง vs เพื่อน — เฉพาะฝั่งพนักงาน */}
          {myEmployeeId && (
            <>
              <div className="flex items-center gap-1.5">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{
                    background: colors.text,
                    border: "1px solid white",
                    boxSizing: "border-box",
                  }}
                />
                <span className="text-sm text-txt-soft">ของคุณ</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{
                    background: "transparent",
                    border: `1.5px solid ${colors.text}`,
                    boxSizing: "border-box",
                  }}
                />
                <span className="text-sm text-txt-soft">ของคนอื่น</span>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="bg-white rounded-[18px] p-4 mb-3.5 shadow-[0_2px_14px_rgba(90,30,10,0.08)] border border-bdr">
        <div
          className={`font-bold text-maroon text-base ${selectedDateLeaves.length ? "mb-3" : ""}`}
        >
          {new Date(`${selectedDate}T00:00:00`).toLocaleDateString("th-TH", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </div>
        {selectedDateLeaves.length === 0 ? (
          <div className="text-txt-soft text-sm mt-2 text-center">
            <span className="inline-flex items-center gap-1">
              <IconSparkles size={14} strokeWidth={2.4} />
              ไม่มีใครลาวันนี้
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {selectedDateLeaves.map((leaveEntry) => {
              const leaveType = LEAVE_TYPES.find(
                (type) => type.id === leaveEntry.type,
              );
              // lookup by employeeId — กันชื่อโดน rename (employeeName ในใบลา
              // อาจเก่า) · ถ้าเป็นเพื่อนที่พนักงานอ่าน directory ไม่ได้ → undefined
              // → ใช้ snapshot ใน leave doc แทน
              const employeeInfo = employeeDirectory.find(
                (employee) => employee.id === leaveEntry.employeeId,
              );
              return (
                <div
                  key={leaveEntry.id}
                  className="flex items-center gap-3 px-3.5 py-3 rounded-xl bg-cream border border-bdr"
                >
                  <AvatarCircle
                    avatar={
                      employeeInfo?.avatar ||
                      leaveEntry.employeeName?.slice(0, 2)
                    }
                    avatarType={employeeInfo?.avatarType || "text"}
                    avatarImageUrl={employeeInfo?.avatarImageUrl || null}
                    size={38}
                    fontSize={13}
                    border={`2px solid ${colors.gold}40`}
                  />
                  <div className="flex-1">
                    <div className="font-semibold text-txt text-base">
                      {employeeInfo?.nickname ||
                        leaveEntry.employeeNickname ||
                        employeeInfo?.name ||
                        leaveEntry.employeeName}
                    </div>
                    <div className="text-sm text-txt-mid mt-0.5 inline-flex items-center gap-1.5">
                      {leaveType?.Icon && (
                        <leaveType.Icon
                          size={13}
                          strokeWidth={2.2}
                          style={{ color: leaveType.color }}
                        />
                      )}
                      {leaveType?.label} · {leaveEntry.days} วันทำการ
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
