/* ─── HomeTab — Home dashboard content ───────────────────────── */

import {
  AlertOctagon as IconAlertOctagon,
  AlertTriangle as IconAlertTriangle,
  CircleCheck as IconCircleCheck,
  ClipboardList as IconClipboardList,
  Wallet as IconWallet,
} from "lucide-react";
import { BUSINESS_RULES, COLORS, LEAVE_TYPES } from "../../constants";
import type { Employee, LeaveEntry, StoreCalendar } from "../../types";
import { dateRange } from "../../utils/dateUtils";
import {
  countWeekdayLeaves,
  getMonthlySettlement,
  leaveOverlapsMonth,
} from "../../utils/leaveUtils";
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
}

export default function HomeTab({
  profile,
  allLeaves,
  employeeDirectory,
  currentEmployee,
  storeCalendar,
}: HomeTabProps) {
  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  /* ─── Monthly quota — count weekday days (Mon-Fri) ไม่ใช่จำนวนใบลา
       1 ใบลา 4 วันธรรมดา = 4 ไม่ใช่ 1 · sunday แยกหักทันที ไม่นับโควต้า */
  const monthLeavesForQuota = profile
    ? allLeaves.filter(
        (lv) =>
          lv.employeeId === profile.id && leaveOverlapsMonth(lv, yearMonth),
      )
    : [];
  const usedThisMonth = countWeekdayLeaves(
    monthLeavesForQuota,
    storeCalendar,
    yearMonth,
  );
  const quota = BUSINESS_RULES.WEEKDAY_LEAVE_QUOTA;
  const remaining = quota - usedThisMonth;
  // ยอดสุทธิเดือนนี้ — ค่าหัก (วันธรรมดาเกินโควต้า + วันอาทิตย์) และโบนัสไม่ลา
  const { deduction, bonus } = getMonthlySettlement(
    monthLeavesForQuota,
    storeCalendar,
    yearMonth,
  );
  const overQuotaDeduction = deduction.total > 0;

  return (
    <>
      {/* Monthly quota card */}
      <div
        className={`relative overflow-hidden bg-white rounded-[18px] px-5 py-4.5 shadow-[0_2px_14px_rgba(90,30,10,0.08)] mb-3 border-[1.5px] ${overQuotaDeduction ? "border-[#C0392B50]" : "border-bdr"}`}
      >
        <MemphisCornerSticker position="tr" tone="gold" />
        {/* title row */}
        <div className="relative flex items-center justify-between mb-3.5">
          <div>
            <div className="font-bold text-maroon text-base">
              โควต้าการลาเดือนนี้
            </div>
            <div className="text-sm text-txt-soft mt-0.5">
              {now.toLocaleDateString("th-TH", {
                month: "long",
                year: "numeric",
              })}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-txt-soft">ใช้ไปแล้ว</div>
            <div
              className={`text-2xl font-extrabold leading-none ${overQuotaDeduction ? "text-red" : usedThisMonth >= quota ? "text-amber" : "text-maroon"}`}
            >
              <span
                key={usedThisMonth}
                className="inline-block animate-[valuePop_0.28s_ease-out]"
              >
                {usedThisMonth}
              </span>
              <span className="text-sm text-txt-soft font-medium">
                /{quota} วัน
              </span>
            </div>
          </div>
        </div>

        {/* progress dots */}
        <div className="flex gap-2.5 mb-3.5">
          {Array.from({ length: quota }).map((_, i) => {
            const filled = i < usedThisMonth;
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: 10,
                  borderRadius: 6,
                  background: filled
                    ? overQuotaDeduction
                      ? COLORS.red
                      : `linear-gradient(90deg,${COLORS.gold},${COLORS.goldLight})`
                    : COLORS.creamDark,
                  boxShadow: filled
                    ? `0 2px 6px ${overQuotaDeduction ? COLORS.red : COLORS.gold}50`
                    : "none",
                  transition: "all 0.3s",
                }}
              />
            );
          })}
        </div>

        {/* status chips */}
        <div className="flex gap-2 flex-wrap">
          {remaining > 0 && (
            <div className="bg-green-lt rounded-[20px] px-3.5 py-[5px] flex items-center gap-1.5">
              <IconCircleCheck
                size={14}
                strokeWidth={2.4}
                className="text-green"
              />
              <span className="text-sm font-semibold text-green">
                ลาได้อีก {remaining} วัน
              </span>
            </div>
          )}
          {usedThisMonth === quota && (
            <div className="bg-amber-lt rounded-[20px] px-3.5 py-[5px] flex items-center gap-1.5">
              <IconAlertTriangle
                size={14}
                strokeWidth={2.4}
                className="text-amber"
              />
              <span className="text-sm font-semibold text-amber">
                ใช้ครบโควต้าแล้ว
              </span>
            </div>
          )}
          {usedThisMonth > quota && (
            <div className="bg-red-lt rounded-[20px] px-3.5 py-[5px] flex items-center gap-1.5">
              <IconAlertOctagon
                size={14}
                strokeWidth={2.4}
                className="text-red"
              />
              <span className="text-sm font-semibold text-red">
                เกินโควต้า {usedThisMonth - quota} วัน
              </span>
            </div>
          )}
          <div className="bg-cream rounded-[20px] px-3.5 py-[5px] flex items-center gap-1.5 border border-bdr">
            <IconClipboardList
              size={14}
              strokeWidth={2.4}
              className="text-txt-mid"
            />
            <span className="text-sm text-txt-mid">
              ลากิจ + ลาป่วย รวม {quota} วัน/เดือน
            </span>
          </div>
          <div className="w-full text-xs text-txt-soft mt-1">
            นับเฉพาะวันธรรมดา · วันอาทิตย์หัก {BUSINESS_RULES.SUNDAY_LEAVE_DEDUCTION}{" "}
            บาททันที (ไม่กินโควต้า)
          </div>
        </div>

        {/* ยอดหักจริงของเดือนนี้ — โชว์เฉพาะเมื่อมียอด */}
        <DeductionSummary deduction={deduction} title="ยอดถูกหักเดือนนี้" />

        {/* โบนัสไม่ลา — เขียวถ้ายังสะอาด · เทาถ้าหลุดไปแล้ว */}
        <BonusNote bonus={bonus} showLost={deduction.total === 0} />

        {/* เตือนล่วงหน้าเมื่อโควต้าหมดแล้วแต่ยังไม่มียอดหัก */}
        {usedThisMonth >= quota && deduction.total === 0 && (
          <div className="mt-3 bg-linear-to-br from-red/6 to-red/9 rounded-xl px-3.5 py-2.5 border border-red/19 flex items-center gap-2.5">
            <IconWallet
              size={22}
              strokeWidth={2.2}
              className="text-red shrink-0"
            />
            <div className="text-sm text-red font-semibold leading-relaxed">
              ใช้โควต้าครบแล้ว — ลาวันธรรมดาครั้งถัดไป
              <span className="font-bold">
                {" "}
                หัก {BUSINESS_RULES.OVER_QUOTA_WEEKDAY_DEDUCTION} บาท/วัน
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
