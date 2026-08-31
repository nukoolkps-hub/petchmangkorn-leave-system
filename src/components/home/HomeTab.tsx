/* ─── HomeTab — Home dashboard content ───────────────────────── */

import {
  AlertOctagon as IconAlertOctagon,
  AlertTriangle as IconAlertTriangle,
  CircleCheck as IconCircleCheck,
  Wallet as IconWallet,
} from "lucide-react";
import { BUSINESS_RULES, LEAVE_TYPES, MAX_LEAVE_BONUS } from "../../constants";
import type { Employee, LeaveEntry, StoreCalendar } from "../../types";
import { dateRange, fmtShort } from "../../utils/dateUtils";
import {
  getMonthlySettlement,
  leaveOverlapsMonth,
} from "../../utils/leaveUtils";
import {
  getPeriodRange,
  isCalendarMonth,
  type PeriodCutoffs,
  periodKeyForDate,
} from "../../utils/payrollPeriod";
import { isStoreClosed } from "../../utils/storeCalendar";
import BonusNote from "../shared/BonusNote";
import DeductionSummary from "../shared/DeductionSummary";
import { MemphisCornerSticker } from "../shared/MemphisPattern";
import TeamCalendar from "./TeamCalendar";

interface HomeTabProps {
  profile: any;
  allLeaves: LeaveEntry[];
  employeeDirectory: Employee[];
  /** employee record ของผู้ใช้ปัจจุบัน (จาก useProfile) */
  currentEmployee?: Employee | null;
  storeCalendar?: StoreCalendar | null;
  periodCutoffs?: PeriodCutoffs;
}

export default function HomeTab({
  profile,
  allLeaves,
  employeeDirectory,
  currentEmployee,
  storeCalendar,
  periodCutoffs,
}: HomeTabProps) {
  const now = new Date();
  const todayYmdStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  /* รอบที่ "วันนี้" ตกอยู่ — ถ้า admin ปิดรอบเดือนนี้ไปแล้วและวันนี้เลย
     วันตัดมา จะกลายเป็นรอบของเดือนถัดไปโดยอัตโนมัติ */
  const yearMonth = periodKeyForDate(todayYmdStr, periodCutoffs);
  const period = getPeriodRange(yearMonth, periodCutoffs);
  const periodIsPlainMonth = isCalendarMonth(yearMonth, period);

  /* ─── ยอดเงินของรอบนี้ ────────────────────────────────────────
     ไม่มีโควต้าวันฟรีแล้ว — ลาวันธรรมดาวันแรกก็ถูกหัก · นับเป็น "วัน"
     ไม่ใช่จำนวนใบลา (1 ใบลา 4 วันธรรมดา = 4 วัน)                      */
  const monthLeaves = profile
    ? allLeaves.filter(
        (lv) => lv.employeeId === profile.id && leaveOverlapsMonth(lv, period),
      )
    : [];
  const { deduction, bonusDetail, net } = getMonthlySettlement(
    monthLeaves,
    storeCalendar,
    period,
  );
  const { weekdayDays, sundayDays } = deduction;
  const totalLeaveDays = weekdayDays + sundayDays;
  const hasDeduction = deduction.total > 0;

  return (
    <>
      {/* สรุปการลา + ยอดเงินของรอบนี้ */}
      <div
        className={`relative overflow-hidden bg-white rounded-[18px] px-5 py-4.5 shadow-[0_2px_14px_rgba(90,30,10,0.08)] mb-3 border-[1.5px] ${hasDeduction ? "border-[#C0392B50]" : "border-bdr"}`}
      >
        <MemphisCornerSticker position="tr" tone="gold" />
        {/* title row */}
        <div className="relative flex items-center justify-between mb-3.5">
          <div>
            <div className="font-bold text-maroon text-base">
              {periodIsPlainMonth ? "การลาเดือนนี้" : "การลารอบนี้"}
            </div>
            <div className="text-sm text-txt-soft mt-0.5">
              {periodIsPlainMonth ? (
                now.toLocaleDateString("th-TH", {
                  month: "long",
                  year: "numeric",
                })
              ) : (
                // รอบไม่ตรงเดือนปฏิทิน (admin ปิดรอบก่อนสิ้นเดือน) →
                // ต้องบอกช่วงวันให้ชัด ไม่งั้นพนักงานนับเองไม่ตรง
                <>
                  รอบ {fmtShort(period.start)} – {fmtShort(period.end)}
                </>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-txt-soft">
              {periodIsPlainMonth ? "สุทธิเดือนนี้" : "สุทธิรอบนี้"}
            </div>
            <div
              className={`text-2xl font-extrabold leading-none ${
                net > 0 ? "text-green" : net < 0 ? "text-red" : "text-maroon"
              }`}
            >
              <span
                key={net}
                className="inline-block animate-[valuePop_0.28s_ease-out]"
              >
                {net > 0 ? "+" : ""}
                {net.toLocaleString("th-TH")}
              </span>
              <span className="text-sm text-txt-soft font-medium"> บาท</span>
            </div>
          </div>
        </div>

        {/* status chips — วันลาที่นับได้ในรอบนี้ แยกตามอัตรา */}
        <div className="flex gap-2 flex-wrap">
          {totalLeaveDays === 0 && (
            <div className="bg-green-lt rounded-[20px] px-3.5 py-[5px] flex items-center gap-1.5">
              <IconCircleCheck
                size={14}
                strokeWidth={2.4}
                className="text-green"
              />
              <span className="text-sm font-semibold text-green">
                ยังไม่ได้ลาเลยในรอบนี้
              </span>
            </div>
          )}
          {weekdayDays > 0 && (
            <div className="bg-red-lt rounded-[20px] px-3.5 py-[5px] flex items-center gap-1.5">
              <IconAlertOctagon
                size={14}
                strokeWidth={2.4}
                className="text-red"
              />
              <span className="text-sm font-semibold text-red">
                ลาวันธรรมดา {weekdayDays} วัน
              </span>
            </div>
          )}
          {sundayDays > 0 && (
            <div className="bg-amber-lt rounded-[20px] px-3.5 py-[5px] flex items-center gap-1.5">
              <IconAlertTriangle
                size={14}
                strokeWidth={2.4}
                className="text-amber"
              />
              <span className="text-sm font-semibold text-amber">
                ลาวันอาทิตย์ {sundayDays} วัน
              </span>
            </div>
          )}
          <div className="w-full text-xs text-txt-soft mt-1">
            วันธรรมดาหัก {BUSINESS_RULES.WEEKDAY_LEAVE_DEDUCTION} บาท/วัน ·
            วันอาทิตย์หัก {BUSINESS_RULES.SUNDAY_LEAVE_DEDUCTION} บาท/วัน ·
            วันที่ร้านปิดไม่นับ
          </div>
        </div>

        {/* ยอดหักจริงของเดือนนี้ — โชว์เฉพาะเมื่อมียอด */}
        <DeductionSummary
          deduction={deduction}
          title={periodIsPlainMonth ? "ยอดถูกหักเดือนนี้" : "ยอดถูกหักรอบนี้"}
        />

        {/* โบนัส — เขียวถ้ายังได้อยู่ (ก้อนใดก้อนหนึ่ง) · เทาถ้าหลุดหมด */}
        <BonusNote bonus={bonusDetail} showLost />

        {/* เตือนล่วงหน้าตอนยังสะอาด — ลาวันแรกแพงกว่าที่คิด เพราะเสีย
            ทั้งค่าหักและโบนัส */}
        {totalLeaveDays === 0 && (
          <div className="mt-3 bg-linear-to-br from-red/6 to-red/9 rounded-xl px-3.5 py-2.5 border border-red/19 flex items-center gap-2.5">
            <IconWallet
              size={22}
              strokeWidth={2.2}
              className="text-red shrink-0"
            />
            <div className="text-sm text-red font-semibold leading-relaxed">
              ลาวันธรรมดา 1 วัน = หัก{" "}
              <span className="font-bold">
                {BUSINESS_RULES.WEEKDAY_LEAVE_DEDUCTION} บาท
              </span>{" "}
              และเสียโบนัสอีก{" "}
              <span className="font-bold">
                {MAX_LEAVE_BONUS.toLocaleString("th-TH")} บาท
              </span>
            </div>
          </div>
        )}
      </div>

      {/* leave type mini stats — นับ "วันลา" จากปฏิทิน แยกตามประเภท ·
          ตัดวันร้านปิด (เสาร์ปิด/วันปิดพิเศษ) ออก เพราะลาวันร้านปิด
          ไม่นับ · วันอาทิตย์ที่ร้านเปิดยังนับ · ไม่เกี่ยวกับยอดหัก */}
      <div className="grid grid-cols-2 gap-2.5 mb-1.5">
        {LEAVE_TYPES.map((lt) => {
          const usedType = profile
            ? allLeaves
                .filter(
                  (lv) =>
                    lv.employeeId === profile.id &&
                    lv.type === lt.id &&
                    lv.start.slice(0, 7) <= yearMonth &&
                    lv.end.slice(0, 7) >= yearMonth,
                )
                .reduce(
                  (sum, lv) =>
                    sum +
                    dateRange(lv.start, lv.end).filter(
                      (d) =>
                        d.startsWith(yearMonth) &&
                        !isStoreClosed(d, storeCalendar),
                    ).length,
                  0,
                )
            : 0;
          return (
            <div
              key={lt.id}
              className="bg-white rounded-[14px] p-3.5 shadow-[0_1px_6px_rgba(90,30,10,0.06)] border border-bdr flex items-center gap-3"
            >
              <div
                className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0"
                style={{ background: lt.colorLt, color: lt.color }}
              >
                <lt.Icon size={18} strokeWidth={2.2} />
              </div>
              <div>
                <div className="text-sm font-semibold text-txt">{lt.label}</div>
                <div className="text-sm text-txt-soft mt-px">
                  เดือนนี้ <b style={{ color: lt.color }}>{usedType}</b> วัน
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <TeamCalendar
        leaveEntries={allLeaves}
        storeCalendar={storeCalendar}
        myEmployeeId={profile?.id || null}
        employeeDirectory={[
          ...employeeDirectory,
          ...(profile && !employeeDirectory.find((e) => e.id === profile.id)
            ? [
                {
                  id: "current",
                  name: profile.name,
                  avatar: profile.avatar,
                  avatarType: profile.avatarType,
                  avatarImageUrl: profile.avatarImageUrl,
                },
              ]
            : []),
        ]}
      />
    </>
  );
}
