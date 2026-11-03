/* ─── ปฏิทินหน้าที่ล่วงหน้า (Duty Forecast) ────────────────────────
   แสดง schedule หน้าที่ตั้งแต่วันนี้ → สิ้นปี เพื่อ forecast เตรียมพร้อม
   ใช้ร่วมกันทั้ง admin (profileId = null → เห็นทุกคน) และพนักงาน
   (profileId set → toggle "เฉพาะของฉัน" ได้)

   คำนวณ client-side จาก server snapshot (pool ที่ resolve แล้ว) — ทั้ง
   2 ฝั่งได้ผลตรงกัน (single source of truth กับ rotation จริง)            */

import {
  ArrowRight as IconArrowRight,
  CalendarClock as IconCalendarClock,
  CalendarRange as IconCalendarRange,
  CalendarX as IconCalendarX,
  ChevronDown as IconChevronDown,
  ChevronRight as IconChevronRight,
  UserCheck as IconUserCheck,
} from "lucide-react";
import { useMemo, useState } from "react";
import type {
  CoverageForecastItem,
  DutyAssignmentsSnapshot,
  SnapshotPoolMember,
} from "../../firebase/dutyAssignments";
import type { Duty, Employee, LeaveEntry, StoreCalendar } from "../../types";
import { formatDayListThai, toYMD } from "../../utils/dateUtils";
import {
  type CoverageSegment,
  computeDutyCounts,
  computeDutyDayActivity,
  computeDutyForecast,
  computeDutyHistory,
  type DutyDayActivity,
} from "../../utils/dutyUtils";
import AvatarCircle from "../shared/AvatarCircle";
import BaseModal from "../shared/BaseModal";
import ModalHeader from "../shared/ModalHeader";
import ThemedSelect from "../shared/ThemedSelect";

interface Props {
  duties: Duty[];
  dutyAssignmentsToday: DutyAssignmentsSnapshot | null;
  /** การลาทั้งหมด → ใช้คำนวณคนแทนล่วงหน้า (ใครลา ใครแทน วันไหน) */
  allLeaves: LeaveEntry[];
  storeCalendar?: StoreCalendar | null;
  profileId: string | null; // null = admin (ดูทุกคน)
  /** admin: employee directory → ใช้นับ coverage counts (แท็บ "จำนวนครั้ง")
   *  ไม่ส่ง = ฝั่งพนักงาน → แท็บจำนวนครั้งแสดงเฉพาะหน้าที่หมุนเวียน */
  employees?: Employee[];
  onClose: () => void;
}

/** label เดือน (พ.ศ.) จาก "YYYY-MM" → "มิถุนายน 2569" */
function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return `${d.toLocaleDateString("th-TH", { month: "long" })} ${y + 543}`;
}

/** label ช่วงในเดือน — monthly: "ทั้งเดือน" · weekly ในเดือนเดียว: "8-14"
 *  · weekly คร่อมเดือน: "29 มิ.ย. - 5 ก.ค." */
function formatRangeInMonth(
  start: string,
  end: string,
  period: string,
): string {
  if (period === "monthly") return "ทั้งเดือน";
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  if (s.getMonth() === e.getMonth()) {
    return `${s.getDate()}-${e.getDate()}`;
  }
  const sMonth = s.toLocaleDateString("th-TH", { month: "short" });
  const eMonth = e.toLocaleDateString("th-TH", { month: "short" });
  return `${s.getDate()} ${sMonth} - ${e.getDate()} ${eMonth}`;
}

interface ForecastItem {
  start: string;
  end: string;
  dutyId: string;
  dutyName: string;
  period: "weekly" | "monthly";
  primaryEmpId: string | null;
  coverage?: CoverageSegment[];
}

/** label วันที่สั้นในเดือน · ช่วง 1 วัน = "3" · หลายวัน = "3-5" */
function segDayLabel(start: string, end: string): string {
  const sd = Number(start.slice(8, 10));
  const ed = Number(end.slice(8, 10));
  return sd === ed ? `${sd}` : `${sd}-${ed}`;
}

/** label วันของการ์ดคนแทน — วันเดียวโชว์เลขเดียว ("8" ไม่ใช่ "8-8" กันสับสน) ·
 *  หลายวันใช้ช่วง (same-month "8-10" · คร่อมเดือน "29 มิ.ย. - 2 ก.ค.") */
function formatCoverageDay(start: string, end: string): string {
  if (start === end) return `${new Date(`${start}T00:00:00`).getDate()}`;
  return formatRangeInMonth(start, end, "weekly");
}

/** รายการในเดือน — การ์ดช่วงวัน (rotation) หรือการ์ดคนแทน (coverage)
 *  รวมเรียงตามวันเริ่มใน list เดียว → การ์ดคนแทนแทรกต่อจากการ์ดสัปดาห์
 *  ที่ครอบวันลานั้น (ไม่กองอยู่ท้ายเดือน) */
type MonthEntry =
  | {
      type: "dates";
      start: string;
      end: string;
      period: "weekly" | "monthly";
      items: ForecastItem[];
    }
  | { type: "coverage"; start: string; item: CoverageForecastItem };

/** 1 คน = 1 บล็อกในแท็บจำนวนครั้ง — บรรทัดบน: avatar + ชื่อ + จำนวนที่เป็น
 *  "คนหลัก" · บรรทัดย่อยใต้ชื่อ: ไปแทนใคร กี่วัน (รวมไว้ที่เดียวกัน ไม่ต้อง
 *  มองหาชื่อซ้ำใน 2 หมวด) · primaryLabel = null → ไม่ได้เป็นคนหลัก (มีแต่แทน) */
function CountRow({
  emp,
  empId,
  primaryLabel,
  subs,
}: {
  emp: SnapshotPoolMember | undefined;
  empId: string;
  primaryLabel: string | null;
  subs: {
    targetId: string;
    targetName: string;
    days: number;
    dates: string[];
  }[];
}) {
  // บรรทัดที่กางอยู่ (targetId) — กางทีละอัน พอสำหรับ "ขอดูวันหน่อย"
  const [openTarget, setOpenTarget] = useState<string | null>(null);
  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-2.5 text-sm">
        {emp && (
          <AvatarCircle
            avatar={emp.avatar}
            avatarType={emp.avatarType}
            avatarImageUrl={emp.avatarImageUrl}
            size={22}
            fontSize={10}
            border="none"
          />
        )}
        <span className="flex-1 min-w-0 font-semibold text-txt truncate">
          {emp?.nickname || emp?.name || empId}
        </span>
        <span
          className={`shrink-0 ${
            primaryLabel ? "font-bold text-maroon" : "text-txt-soft text-xs"
          }`}
        >
          {primaryLabel ?? "ไม่ได้เป็นคนหลัก"}
        </span>
      </div>
      {/* บรรทัดย่อย: ไปแทนใคร กี่วัน — เยื้องให้ตรงกับชื่อ (avatar 22 + gap 10) */}
      {subs.length > 0 && (
        <div className="mt-1 ml-8 flex flex-col gap-0.5">
          {subs.map((s) => {
            const open = openTarget === s.targetId;
            return (
              <div key={s.targetId}>
                {/* กดเพื่อกางดูว่าไปแทน "วันไหนบ้าง" — ตัวเลขวันอย่างเดียว
                    บอกไม่ได้ว่าตรงกับวันที่จำได้ไหม */}
                <button
                  type="button"
                  onClick={() => setOpenTarget(open ? null : s.targetId)}
                  className="w-full flex items-center justify-between gap-2 text-[11px] font-[inherit] cursor-pointer text-left"
                >
                  <span className="flex items-center gap-0.5 min-w-0">
                    {open ? (
                      <IconChevronDown
                        size={11}
                        strokeWidth={2.6}
                        className="shrink-0 text-txt-soft"
                      />
                    ) : (
                      <IconChevronRight
                        size={11}
                        strokeWidth={2.6}
                        className="shrink-0 text-txt-soft"
                      />
                    )}
                    <span className="text-txt-soft truncate min-w-0">
                      แทน {s.targetName}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold text-maroon/80">
                    {s.days} วัน
                  </span>
                </button>
                {open && s.dates.length > 0 && (
                  <div className="ml-3.5 mt-0.5 mb-1 px-2 py-1 rounded-[6px] bg-cream/70 border border-bdr text-[11px] text-txt leading-relaxed">
                    {formatDayListThai(s.dates)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function DutyForecastModal({
  duties,
  dutyAssignmentsToday,
  allLeaves,
  storeCalendar,
  profileId,
  employees,
  onClose,
}: Props) {
  // พนักงาน default = เฉพาะของฉัน · admin ไม่มี profileId → ดูทั้งหมดเสมอ
  const [mineOnly, setMineOnly] = useState<boolean>(!!profileId);
  // ล่วงหน้า (default) / ย้อนหลัง / จำนวนครั้ง (สรุปนับทั้งปี · เฉพาะที่ทำแล้ว)
  const [view, setView] = useState<"future" | "past" | "counts">("future");
  // กรองเฉพาะหน้าที่เดียว ("" = ทุกหน้าที่) — ช่วยดูว่าหน้าที่นั้นคนซ้ำไหม
  const [dutyFilter, setDutyFilter] = useState<string>("");
  const isPast = view === "past";
  const isCounts = view === "counts";

  const todayYmd = toYMD(new Date());
  const endYmd = `${new Date().getFullYear()}-12-31`;
  const beYear = new Date().getFullYear() + 543;
  // ย้อนหลัง 3 เดือน (ตั้งแต่วันที่ 1 ของเดือน 3 เดือนก่อน)
  const historyFromYmd = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 3);
    return toYMD(d);
  }, []);

  // pool ที่ resolve แล้ว + ข้อมูลคน จาก snapshot (self-contained)
  // แหล่ง pool = dutyPools (roster ของทุก duty) เพื่อให้ forecast มี pool แม้
  // วันอาทิตย์ที่ weekly+skipSundays ถูกตัดจาก assignments · fallback assignments
  // สำหรับ snapshot เก่าที่ยังไม่มี dutyPools (backward compat)
  const { poolByDutyId, empById } = useMemo(() => {
    const pools = new Map<string, string[]>();
    const emps = new Map<string, SnapshotPoolMember>();
    const dutyPools = dutyAssignmentsToday?.dutyPools;
    if (dutyPools) {
      for (const [dutyId, dp] of Object.entries(dutyPools)) {
        pools.set(
          dutyId,
          dp.pool.map((m) => m.id),
        );
        for (const m of dp.pool) emps.set(m.id, m);
      }
    } else {
      for (const a of dutyAssignmentsToday?.assignments || []) {
        pools.set(
          a.dutyId,
          a.pool.map((m) => m.id),
        );
        for (const m of a.pool) emps.set(m.id, m);
      }
    }
    return { poolByDutyId: pools, empById: emps };
  }, [dutyAssignmentsToday]);

  const forecast = useMemo(
    () =>
      computeDutyForecast(
        duties,
        poolByDutyId,
        todayYmd,
        endYmd,
        allLeaves,
        storeCalendar,
      ),
    [duties, poolByDutyId, todayYmd, endYmd, allLeaves, storeCalendar],
  );

  // ประวัติย้อนหลัง — คำนวณเฉพาะตอนเปิด view "ย้อนหลัง"
  const history = useMemo(
    () =>
      isPast
        ? computeDutyHistory(duties, poolByDutyId, historyFromYmd, todayYmd)
        : [],
    [isPast, duties, poolByDutyId, historyFromYmd, todayYmd],
  );

  const activeForecast = isPast ? history : forecast;

  // สรุป "จำนวนครั้ง" รวมทั้งปี — นับเฉพาะที่ทำไปแล้ว (ตั้งแต่ต้นปี → วันนี้ ·
  // ไม่รวมล่วงหน้า) · rotation จากสูตร · coverage นับจากใบลาจริง (admin ส่ง
  // employees → นับ coverage ได้ · ฝั่งพนักงานไม่มี employees → แสดงเฉพาะหมุนเวียน)
  const yearStartYmd = `${todayYmd.slice(0, 4)}-01-01`;
  const hasEmployees = !!employees && employees.length > 0;
  // คนหลักรายเดือน (monthly) — นับเป็น "เดือน" (จำนวนรอบ) · weekly ใช้ day activity
  const monthlyPrimaryCounts = useMemo(
    () =>
      isCounts
        ? computeDutyCounts(duties, poolByDutyId, yearStartYmd, todayYmd)
        : new Map<string, Map<string, number>>(),
    [isCounts, duties, poolByDutyId, yearStartYmd, todayYmd],
  );
  // กิจกรรมรายวัน — คนหลัก weekly (วัน) + คนแทน rotation จาก pool (snapshot ·
  // ได้ทั้ง admin/พนักงาน) · coverage duty (แทนคนลา) ต้องมี employees (admin)
  const dayActivity = useMemo(
    () =>
      isCounts
        ? computeDutyDayActivity(
            duties,
            poolByDutyId,
            allLeaves,
            storeCalendar,
            yearStartYmd,
            todayYmd,
            employees,
          )
        : new Map<string, DutyDayActivity>(),
    [
      isCounts,
      poolByDutyId,
      employees,
      duties,
      allLeaves,
      storeCalendar,
      yearStartYmd,
      todayYmd,
    ],
  );

  // แถวสรุป — ต่อหน้าที่ → ต่อ "คน" (1 คน 1 บล็อก): จำนวนที่เป็นคนหลัก
  // (weekly=วัน · monthly=เดือน) + บรรทัดย่อย "แทนใคร กี่วัน" ใต้ชื่อคนนั้น
  const countRows = useMemo(() => {
    if (!isCounts) return [];
    const nick = (id: string) => empById.get(id)?.nickname || "";
    // ชื่อ "คนที่ถูกแทน" (target) — coverage target อยู่คนละ pool กับ empById
    // จึง fallback ไป employees (admin มีเสมอเมื่อดูแท็บจำนวนครั้ง)
    const empDir = new Map((employees ?? []).map((e) => [e.id, e]));
    const targetNick = (id: string) =>
      empDir.get(id)?.nickname ||
      empDir.get(id)?.name ||
      empById.get(id)?.nickname ||
      empById.get(id)?.name ||
      id;
    const ordered = [
      ...duties.filter((d) => d.kind !== "coverage"),
      ...(hasEmployees ? duties.filter((d) => d.kind === "coverage") : []),
    ];
    const rows = ordered
      .filter((d) => !dutyFilter || d.id === dutyFilter)
      .map((d) => {
        const act = dayActivity.get(d.id);
        // คนหลัก: weekly → วันจริง (day activity) · monthly → เดือน (periods)
        const primaryEntries: [string, number][] =
          d.kind === "coverage"
            ? []
            : d.period === "monthly"
              ? [...(monthlyPrimaryCounts.get(d.id)?.entries() || [])]
              : [...(act?.primaryDays.entries() || [])];
        const unit = d.period === "monthly" ? "เดือน" : "วัน";
        // รวมทุกคนที่เกี่ยวข้องกับหน้าที่นี้ (เป็นคนหลัก และ/หรือ ไปแทน)
        // → 1 คน 1 บล็อก · เก็บ count คนหลักไว้ใช้เรียงลำดับ
        const people = new Map<
          string,
          {
            empId: string;
            primaryCount: number;
            primaryLabel: string | null;
            subs: {
              targetId: string;
              targetName: string;
              days: number;
              dates: string[];
            }[];
            subDays: number;
          }
        >();
        const ensure = (empId: string) => {
          let p = people.get(empId);
          if (!p) {
            p = {
              empId,
              primaryCount: 0,
              primaryLabel: null,
              subs: [],
              subDays: 0,
            };
            people.set(empId, p);
          }
          return p;
        };
        for (const [empId, n] of primaryEntries) {
          const p = ensure(empId);
          p.primaryCount = n;
          p.primaryLabel = `${n} ${unit}`;
        }
        for (const [empId, c] of act?.substitute.entries() || []) {
          const p = ensure(empId);
          p.subDays += c.days;
          p.subs.push(
            ...[...c.byTarget.entries()].map(([targetId, days]) => ({
              targetId,
              targetName: targetNick(targetId),
              days,
              // วันที่ไปแทนจริง (เรียงเก่า→ใหม่แล้วจาก computeDutyDayActivity)
              dates: c.datesByTarget.get(targetId) ?? [],
            })),
          );
        }
        // เรียงบรรทัดย่อยของแต่ละคน: วันมาก→น้อย แล้วชื่อคนที่ถูกแทน
        for (const p of people.values()) {
          p.subs.sort(
            (a, b) =>
              b.days - a.days || a.targetName.localeCompare(b.targetName, "th"),
          );
        }
        // เรียงคน: คนหลักมาก→น้อย · คนที่ไม่ได้เป็นคนหลักไปท้าย (เรียงตามวันแทน)
        const list = [...people.values()].sort(
          (a, b) =>
            b.primaryCount - a.primaryCount ||
            b.subDays - a.subDays ||
            nick(a.empId).localeCompare(nick(b.empId), "th"),
        );
        return {
          duty: d,
          people: list.map((p) => ({ ...p, emp: empById.get(p.empId) })),
        };
      });
    // "เฉพาะของคุณ" (ฝั่งพนักงาน) — เหลือเฉพาะบล็อกของ profileId แล้วตัด
    // duty ที่ไม่เหลือคน
    if (profileId && mineOnly) {
      return rows
        .map((r) => ({
          duty: r.duty,
          people: r.people.filter((p) => p.empId === profileId),
        }))
        .filter((r) => r.people.length > 0);
    }
    return rows;
  }, [
    isCounts,
    duties,
    dutyFilter,
    monthlyPrimaryCounts,
    dayActivity,
    empById,
    employees,
    hasEmployees,
    profileId,
    mineOnly,
  ]);

  // flatten ทุก period → item เดียว เรียงตามวันที่ (แล้วชื่อหน้าที่)
  const allItems = useMemo(() => {
    const items: ForecastItem[] = [];
    for (const f of activeForecast) {
      for (const p of f.periods) {
        items.push({
          start: p.start,
          end: p.end,
          dutyId: f.dutyId,
          dutyName: f.dutyName,
          period: f.period,
          primaryEmpId: p.primaryEmpId,
          coverage: p.coverage,
        });
      }
    }
    items.sort(
      (a, b) =>
        a.start.localeCompare(b.start) ||
        a.dutyName.localeCompare(b.dutyName, "th"),
    );
    return items;
  }, [activeForecast]);

  // coverage duty (แทนคนลา) ล่วงหน้า — server-computed ใน snapshot · เฉพาะ
  // ของฉัน = ฉันเป็นคนแทน หรือฉันคือคนที่ลา · ย้อนหลังไม่มี coverage (แสดงคนหลัก)
  const coverageForecast = useMemo<CoverageForecastItem[]>(() => {
    if (isPast) return [];
    const all = dutyAssignmentsToday?.coverageForecast || [];
    if (!(profileId && mineOnly)) return all;
    return all.filter(
      (c) => c.substituteEmpId === profileId || c.targetEmpId === profileId,
    );
  }, [isPast, dutyAssignmentsToday, profileId, mineOnly]);

  // group 2 ชั้น: เดือน → วัน (card ต่อช่วงวัน · ในการ์ดมีหลายหน้าที่) +
  // coverage entries ของเดือนนั้น (แยกการ์ด amber)
  const months = useMemo(() => {
    // เฉพาะของฉัน = เป็น primary หรือเป็น "คนแทน" ในช่วงไหนของ period นี้
    // (พนักงานจะได้เห็นว่าต้องไปแทนใครวันไหนด้วย ไม่ใช่แค่เวรตัวเอง)
    // + กรองเฉพาะหน้าที่ที่เลือก (dutyFilter) ถ้าตั้งไว้
    const filtered = allItems.filter((it) => {
      if (dutyFilter && it.dutyId !== dutyFilter) return false;
      if (profileId && mineOnly) {
        return (
          it.primaryEmpId === profileId ||
          it.coverage?.some((s) => s.substituteEmpId === profileId)
        );
      }
      return true;
    });
    // ym → { dates: dateKey → items[], coverage: [] }
    const byMonth = new Map<
      string,
      { dates: Map<string, ForecastItem[]>; coverage: CoverageForecastItem[] }
    >();
    const ensure = (ym: string) => {
      let e = byMonth.get(ym);
      if (!e) {
        e = { dates: new Map(), coverage: [] };
        byMonth.set(ym, e);
      }
      return e;
    };
    for (const it of filtered) {
      const { dates } = ensure(it.start.slice(0, 7));
      const dateKey = `${it.start}__${it.end}`;
      const list = dates.get(dateKey);
      if (list) list.push(it);
      else dates.set(dateKey, [it]);
    }
    for (const c of coverageForecast) {
      if (dutyFilter && c.dutyId !== dutyFilter) continue;
      ensure(c.start.slice(0, 7)).coverage.push(c);
    }
    // รวมการ์ด rotation + การ์ดคนแทนเป็น list เดียวเรียงตามวันเริ่ม —
    // วันเริ่มตรงกันให้ rotation มาก่อน (การ์ดคนแทนอยู่ใต้สัปดาห์ที่ครอบวันลา)
    // ย้อนหลัง: เรียงเดือน + ช่วงวัน จากใหม่→เก่า (ล่าสุดอยู่บนสุด)
    const dir = isPast ? -1 : 1;
    return [...byMonth.entries()]
      .sort((a, b) => dir * a[0].localeCompare(b[0]))
      .map(([ym, e]) => {
        const entries: MonthEntry[] = [
          ...[...e.dates.values()].map(
            (items): MonthEntry => ({
              type: "dates",
              start: items[0].start,
              end: items[0].end,
              period: items[0].period,
              items,
            }),
          ),
          ...e.coverage.map(
            (c): MonthEntry => ({ type: "coverage", start: c.start, item: c }),
          ),
        ].sort(
          (a, b) =>
            dir * a.start.localeCompare(b.start) ||
            (a.type === b.type ? 0 : a.type === "dates" ? -1 : 1),
        );
        return { ym, label: monthLabel(ym), entries };
      });
  }, [allItems, coverageForecast, profileId, mineOnly, dutyFilter, isPast]);

  const hasData =
    (dutyAssignmentsToday?.assignments?.length || 0) > 0 ||
    Object.keys(dutyAssignmentsToday?.dutyPools || {}).length > 0;
  const showPerson = !(profileId && mineOnly);

  return (
    <BaseModal onClose={onClose} maxWidthClass="max-w-[560px]">
      <ModalHeader
        Icon={IconCalendarRange}
        title="ปฏิทินหน้าที่"
        subtitle={
          isCounts
            ? `จำนวนครั้ง — รวมทั้งปี พ.ศ. ${beYear} (เฉพาะที่ทำไปแล้ว)`
            : isPast
              ? "ย้อนหลัง 3 เดือน (คำนวณจากสูตรหมุนเวียน)"
              : `ตารางหมุนเวียนถึงสิ้นปี พ.ศ. ${beYear}`
        }
        onClose={onClose}
      />

      <div className="px-4 py-3.5">
        {/* toggle ล่วงหน้า / ย้อนหลัง / จำนวนครั้ง */}
        <div className="flex gap-2 mb-3">
          {(
            [
              ["future", "ล่วงหน้า"],
              ["past", "ย้อนหลัง"],
              ["counts", "จำนวนครั้ง"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`flex-1 py-2 rounded-[9px] text-sm font-semibold cursor-pointer font-[inherit] border-[1.5px] active:scale-[0.98] transition-transform ${
                view === v
                  ? "bg-maroon text-white border-maroon"
                  : "bg-white text-txt-mid border-bdr"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* กรองเฉพาะหน้าที่ — ช่วยดูว่าหน้าที่นั้นคนซ้ำในเดือนไหม (รวม coverage) */}
        <div className="mb-3">
          <ThemedSelect
            value={dutyFilter}
            onChange={setDutyFilter}
            options={[
              { value: "", label: "ทุกหน้าที่" },
              ...duties.map((d) => ({ value: d.id, label: d.name })),
            ]}
          />
        </div>

        {/* note ย้อนหลัง — ไม่ใช่ log จริง */}
        {isPast && (
          <div className="text-xs text-txt-mid mb-3 leading-relaxed bg-gold-pale/50 border border-gold/30 rounded-[9px] px-3 py-2">
            <IconCalendarX
              size={12}
              strokeWidth={2.4}
              className="inline mr-1 -mt-0.5 text-maroon"
            />
            ย้อนหลังคำนวณจากสูตรหมุนเวียนด้วยรายชื่อปัจจุบัน (ระบบไม่ได้เก็บ log เวรรายวัน) —
            ตรงกับที่เกิดจริงเฉพาะช่วงที่รายชื่อคนทำหน้าที่ไม่เปลี่ยน · แสดง "คนหลัก" ตามรอบ
            ไม่รวมผลการลา/คนแทน
          </div>
        )}

        {/* toggle เฉพาะของฉัน — เฉพาะฝั่งพนักงาน */}
        {profileId && (
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => setMineOnly(true)}
              className={`flex-1 py-2 rounded-[9px] text-sm font-semibold cursor-pointer font-[inherit] border-[1.5px] active:scale-[0.98] transition-transform ${
                mineOnly
                  ? "bg-maroon text-white border-maroon"
                  : "bg-white text-txt-mid border-bdr"
              }`}
            >
              เฉพาะของคุณ
            </button>
            <button
              type="button"
              onClick={() => setMineOnly(false)}
              className={`flex-1 py-2 rounded-[9px] text-sm font-semibold cursor-pointer font-[inherit] border-[1.5px] active:scale-[0.98] transition-transform ${
                !mineOnly
                  ? "bg-maroon text-white border-maroon"
                  : "bg-white text-txt-mid border-bdr"
              }`}
            >
              ทั้งหมด
            </button>
          </div>
        )}

        {/* note (ล่วงหน้า) */}
        {view === "future" && (
          <div className="text-xs text-txt-soft mb-3 leading-relaxed">
            ตารางตามรอบหมุนเวียน + คนแทนช่วงที่มีคนลา (เท่าที่ยื่นลาไว้ล่วงหน้า) —
            ใช้สำหรับวางแผนล่วงหน้า
          </div>
        )}

        {/* note (จำนวนครั้ง) */}
        {isCounts && (
          <div className="text-xs text-txt-mid mb-3 leading-relaxed bg-gold-pale/50 border border-gold/30 rounded-[9px] px-3 py-2">
            <IconCalendarX
              size={12}
              strokeWidth={2.4}
              className="inline mr-1 -mt-0.5 text-maroon"
            />
            นับ <b>ตั้งแต่ต้นปีถึงวันนี้</b> — เฉพาะที่ทำไปแล้ว (ไม่รวมล่วงหน้า) · ตัวเลขข้างชื่อ =
            จำนวนที่เป็น <b>คนหลัก</b> (รายสัปดาห์นับเป็น <b>วัน</b> ที่อยู่ทำจริง ไม่นับวันลา ·
            รายเดือนนับเป็น <b>เดือน</b> รวมเดือนนี้ที่กำลังทำ) · บรรทัดเล็กใต้ชื่อ ={" "}
            <b>ไปแทนใคร กี่วัน</b> (ตอนคนนั้นลา) · <b>กดบรรทัดนั้นเพื่อดูว่าวันไหนบ้าง</b>
            {!hasEmployees && " · ฝั่งนี้แสดงเฉพาะหน้าที่หมุนเวียน"}
            <span className="block mt-1 text-txt-soft">
              คำนวณจากสูตรหมุนเวียนด้วยรายชื่อปัจจุบัน (ไม่ใช่บันทึกเวรจริง) —
              ตรงกับที่เกิดขึ้นจริงเฉพาะช่วงที่รายชื่อคนทำหน้าที่ไม่เปลี่ยน
            </span>
          </div>
        )}

        {isCounts ? (
          countRows.length === 0 ||
          countRows.every((r) => r.people.length === 0) ? (
            <div className="text-center text-txt-soft py-10 px-6">
              {profileId && mineOnly
                ? "คุณยังไม่ได้ทำหน้าที่ในปีนี้"
                : "ยังไม่มีใครทำหน้าที่ในปีนี้"}
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {countRows.map(({ duty, people }) => (
                <div
                  key={duty.id}
                  className="rounded-[11px] border border-bdr bg-white overflow-hidden"
                >
                  <div className="px-3 py-1.5 bg-gold-pale/60 border-b border-bdr">
                    <span className="text-sm font-bold text-maroon truncate">
                      {duty.name}
                    </span>
                  </div>
                  {people.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-txt-soft italic">
                      ยังไม่มีในปีนี้
                    </div>
                  ) : (
                    <div className="flex flex-col divide-y divide-bdr/40">
                      {/* 1 คน 1 บล็อก — จำนวนที่เป็นคนหลัก + บรรทัดย่อย "แทนใคร กี่วัน" */}
                      {people.map((p) => (
                        <CountRow
                          key={p.empId}
                          emp={p.emp}
                          empId={p.empId}
                          primaryLabel={p.primaryLabel}
                          subs={p.subs}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        ) : !hasData ? (
          <div className="text-center text-txt-soft py-10 px-6">
            ยังไม่มีข้อมูลตาราง — ลองรีเฟรชหลัง ADMIN ตั้งค่าหน้าที่
          </div>
        ) : months.length === 0 ? (
          <div className="text-center text-txt-soft py-10 px-6">
            <div className="flex justify-center mb-3 text-gold">
              <IconUserCheck size={40} strokeWidth={1.8} />
            </div>
            {isPast
              ? "ไม่มีประวัติในช่วง 3 เดือนที่ผ่านมา"
              : profileId && mineOnly
                ? "คุณยังไม่มีหน้าที่ในช่วงที่เหลือของปีนี้"
                : "ยังไม่มีหน้าที่ในช่วงที่เหลือของปีนี้"}
          </div>
        ) : (
          /* ─── view: เดือน → การ์ดต่อวัน → หน้าที่ + ชื่อ ─── */
          <div className="flex flex-col gap-3.5">
            {months.map((mth) => (
              <div key={mth.ym}>
                {/* หัวข้อเดือน */}
                <div className="flex items-center gap-2 px-3 py-2.5 bg-maroon rounded-[12px] mb-2">
                  <IconCalendarClock
                    size={16}
                    strokeWidth={2.4}
                    className="text-gold-lt shrink-0"
                  />
                  <div className="flex-1 min-w-0 font-bold text-sm text-gold-lt">
                    {mth.label}
                  </div>
                </div>

                {/* การ์ดต่อช่วงวัน + การ์ดคนแทน เรียงตามวันเริ่มใน list เดียว */}
                <div className="flex flex-col gap-2">
                  {mth.entries.map((en) =>
                    en.type === "dates" ? (
                      <div
                        key={`${en.start}-${en.end}`}
                        className="rounded-[11px] border border-bdr bg-white overflow-hidden"
                      >
                        {/* หัวการ์ด = วันที่ */}
                        <div className="px-3 py-1.5 bg-gold-pale/60 border-b border-bdr">
                          <span className="text-sm font-bold text-maroon">
                            {formatRangeInMonth(en.start, en.end, en.period)}
                          </span>
                        </div>
                        {/* หน้าที่ + ชื่อ */}
                        <div className="flex flex-col">
                          {en.items.map((it, i) => {
                            const emp = it.primaryEmpId
                              ? empById.get(it.primaryEmpId)
                              : null;
                            const isMe =
                              !!profileId && it.primaryEmpId === profileId;
                            const primaryName =
                              emp?.nickname || emp?.name || "";
                            return (
                              <div
                                key={`${it.dutyId}-${i}`}
                                className={`${i > 0 ? "border-t border-bdr/50" : ""} ${isMe ? "bg-gold-pale/40" : ""}`}
                              >
                                {/* แถวหลัก: หน้าที่ + primary (คนรับผิดชอบรอบนี้) */}
                                <div className="flex items-center gap-2.5 px-3 py-2 text-sm">
                                  <div className="flex-1 min-w-0 font-semibold text-txt truncate">
                                    {it.dutyName}
                                  </div>
                                  {showPerson &&
                                    (emp ? (
                                      <div className="shrink-0 flex items-center gap-1.5 max-w-[55%]">
                                        <AvatarCircle
                                          avatar={emp.avatar}
                                          avatarType={emp.avatarType}
                                          avatarImageUrl={emp.avatarImageUrl}
                                          size={22}
                                          fontSize={10}
                                          border="none"
                                        />
                                        <span
                                          className={`truncate text-xs ${isMe ? "font-bold text-maroon" : "font-semibold text-txt-mid"}`}
                                        >
                                          {emp.nickname || emp.name}
                                          {isMe && (
                                            <span className="ml-1 text-[11px] text-maroon-lt font-bold">
                                              (คุณ)
                                            </span>
                                          )}
                                        </span>
                                      </div>
                                    ) : (
                                      <div className="shrink-0 text-txt-soft italic text-xs">
                                        ยังไม่มีคน
                                      </div>
                                    ))}
                                </div>

                                {/* คนแทนช่วงที่ primary ลา (วางแผนล่วงหน้า) */}
                                {it.coverage?.map((seg) => {
                                  const sub = seg.substituteEmpId
                                    ? empById.get(seg.substituteEmpId)
                                    : null;
                                  const subIsMe =
                                    !!profileId &&
                                    seg.substituteEmpId === profileId;
                                  return (
                                    <div
                                      key={seg.start}
                                      className="mx-3 mb-2 flex items-center gap-1.5 rounded-lg bg-amber-lt/60 border border-amber/25 px-2 py-1.5 text-xs"
                                    >
                                      <IconCalendarX
                                        size={13}
                                        strokeWidth={2.4}
                                        className="text-amber shrink-0 translate-y-px"
                                      />
                                      <span className="font-extrabold text-amber shrink-0">
                                        {segDayLabel(seg.start, seg.end)}
                                      </span>
                                      <span className="text-txt-soft truncate min-w-0">
                                        {primaryName || "คน"} ลา
                                      </span>
                                      <IconArrowRight
                                        size={12}
                                        strokeWidth={2.6}
                                        className="text-txt-soft shrink-0 translate-y-px"
                                      />
                                      {sub ? (
                                        <span className="inline-flex items-center gap-1 min-w-0 shrink">
                                          <AvatarCircle
                                            avatar={sub.avatar}
                                            avatarType={sub.avatarType}
                                            avatarImageUrl={sub.avatarImageUrl}
                                            size={18}
                                            fontSize={9}
                                            border="none"
                                          />
                                          <span
                                            className={`truncate font-bold ${subIsMe ? "text-maroon" : "text-green"}`}
                                          >
                                            {sub.nickname || sub.name}
                                            {subIsMe && " (คุณ)"} แทน
                                          </span>
                                        </span>
                                      ) : (
                                        <span className="font-bold text-red shrink-0">
                                          ไม่มีคนแทน
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      /* การ์ดคนแทนกลุ่มเป้าหมาย (หน้าที่แบบ "แทนคนลา") */
                      (() => {
                        const c = en.item;
                        const sub = c.substituteEmpId
                          ? empById.get(c.substituteEmpId)
                          : null;
                        const subIsMe =
                          !!profileId && c.substituteEmpId === profileId;
                        const targetIsMe =
                          !!profileId && c.targetEmpId === profileId;
                        return (
                          <div
                            key={`cov-${c.dutyId}-${c.targetEmpId}-${c.start}`}
                            className="rounded-[11px] border border-amber/30 bg-amber-lt/30 overflow-hidden"
                          >
                            <div className="px-3 py-1.5 bg-amber-lt/60 border-b border-amber/20 flex items-center justify-between gap-2">
                              <span className="text-sm font-bold text-amber">
                                {formatCoverageDay(c.start, c.end)}
                              </span>
                              <span className="text-[11px] font-semibold text-amber/80 truncate min-w-0">
                                {c.dutyName}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 px-3 py-2 text-xs">
                              <IconCalendarX
                                size={13}
                                strokeWidth={2.4}
                                className="text-amber shrink-0 translate-y-px"
                              />
                              <span className="text-txt-soft truncate min-w-0">
                                {c.targetName || "คน"}
                                {targetIsMe && " (คุณ)"} ลา
                              </span>
                              <IconArrowRight
                                size={12}
                                strokeWidth={2.6}
                                className="text-txt-soft shrink-0 translate-y-px"
                              />
                              {c.substituteEmpId ? (
                                <span className="inline-flex items-center gap-1 min-w-0 shrink">
                                  {sub && (
                                    <AvatarCircle
                                      avatar={sub.avatar}
                                      avatarType={sub.avatarType}
                                      avatarImageUrl={sub.avatarImageUrl}
                                      size={18}
                                      fontSize={9}
                                      border="none"
                                    />
                                  )}
                                  <span
                                    className={`truncate font-bold ${subIsMe ? "text-maroon" : "text-green"}`}
                                  >
                                    {sub?.nickname ||
                                      sub?.name ||
                                      c.substituteName ||
                                      "คน"}
                                    {subIsMe && " (คุณ)"} แทน
                                  </span>
                                </span>
                              ) : (
                                <span className="font-bold text-red shrink-0">
                                  ไม่มีคนแทน
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })()
                    ),
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </BaseModal>
  );
}
