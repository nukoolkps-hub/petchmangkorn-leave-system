import { describe, expect, it } from "vitest";
import type { Duty, Employee, LeaveEntry } from "../types";
import {
  applicableDuties,
  computeAllDutiesForDay,
  computeCoverageForecast,
  computeDutyCounts,
  computeDutyDayActivity,
  computeDutyForDay,
  computeDutyForecast,
  computeDutyHistory,
  computeForecastPrimaries,
  getPeriodIndex,
  getPeriodRange,
  getPeriodRangeForIndex,
  hashDutyId,
  isSunday,
  monthlyPrimariesForDay,
  pickPrimary,
  pickRotationSubstitute,
  replayRotationSubHistory,
  resolveDutyPool,
} from "./dutyUtils";

// ─── fixtures ──────────────────────────────────────────────────────
// ต้นทาง (ระบบเพชรทองมุกดา) ผูก pool กับตำแหน่ง `roleId: "sales"` แล้วให้ทุก
// emp() เป็น sales · ที่นี่ pool = memberEmpIds → ใส่ทุก id ที่เทสต์ใช้เป็น
// "พนักงานขาย" (คนที่ไม่อยู่ในลิสต์ employees ของเทสต์นั้นถูกข้ามเอง) ·
// c1/c2 = คนแทนของ coverage (ต้นทางเป็นตำแหน่ง cashier) จึงไม่อยู่ในนี้
const SALES = ["a", "b", "c", "d", "e", "f", "t1", "x", "y", "z"];

function duty(over: Partial<Duty> = {}): Duty {
  return {
    id: "d1",
    name: "หน้าที่",
    period: "weekly",
    memberEmpIds: SALES,
    rotationStartDate: "2026-06-01",
    createdAt: 0,
    updatedAt: 0,
    ...over,
  } as Duty;
}

function emp(id: string, over: Partial<Employee> = {}): Employee {
  return {
    id,
    name: id,
    ...over,
  } as Employee;
}

function leave(employeeId: string, start: string, end = start): LeaveEntry {
  return {
    id: `${employeeId}-${start}`,
    employeeId,
    employeeName: employeeId,
    type: "personal",
    start,
    end,
    days: 1,
  } as LeaveEntry;
}

// ─── hashDutyId ────────────────────────────────────────────────────
describe("hashDutyId", () => {
  it("is deterministic and unsigned 32-bit", () => {
    expect(hashDutyId("duty-1")).toBe(hashDutyId("duty-1"));
    const h = hashDutyId("anything");
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(2 ** 32);
    expect(Number.isInteger(h)).toBe(true);
  });

  it("matches locked reference values (client/server must agree)", () => {
    // ⚠️ if these change, functions/src/duty/dutyUtils.ts must change too
    expect(hashDutyId("duty-1")).toBe(1352159);
    expect(hashDutyId("clean")).toBe(1349386046);
    expect(hashDutyId("a")).toBe(3826002220);
  });

  it("distinguishes different ids", () => {
    expect(hashDutyId("a")).not.toBe(hashDutyId("b"));
  });
});

describe("isSunday", () => {
  it("detects Sundays via local date parsing", () => {
    expect(isSunday("2026-06-07")).toBe(true); // Sunday
    expect(isSunday("2026-06-08")).toBe(false); // Monday
  });
});

// ─── applicableDuties ──────────────────────────────────────────────
describe("applicableDuties", () => {
  const weekly = duty({ id: "w", period: "weekly" });
  const weeklyNoSun = duty({ id: "ws", period: "weekly", skipSundays: true });
  const monthly = duty({ id: "m", period: "monthly" });
  const all = [weekly, weeklyNoSun, monthly];

  it("returns nothing on a default-closed Saturday", () => {
    expect(applicableDuties(all, "2026-06-06")).toEqual([]);
  });

  it("returns all duties on a specially-opened Saturday", () => {
    expect(
      applicableDuties(all, "2026-06-06", {
        extraOpenSaturdays: ["2026-06-06"],
        extraClosedWeekdays: [],
      }),
    ).toHaveLength(3);
  });

  it("returns nothing on an admin-closed weekday", () => {
    expect(
      applicableDuties(all, "2026-06-08", {
        extraOpenSaturdays: [],
        extraClosedWeekdays: ["2026-06-08"],
      }),
    ).toEqual([]);
  });

  it("drops weekly+skipSundays duties on an open Sunday, keeps the rest", () => {
    const res = applicableDuties(all, "2026-06-07");
    expect(res.map((d) => d.id).sort()).toEqual(["m", "w"]);
  });

  it("returns nothing on an admin-closed Sunday", () => {
    expect(
      applicableDuties(all, "2026-06-07", {
        extraOpenSaturdays: [],
        extraClosedWeekdays: [],
        extraClosedSundays: ["2026-06-07"],
      }),
    ).toEqual([]);
  });

  it("returns all duties on a normal weekday", () => {
    expect(applicableDuties(all, "2026-06-08")).toHaveLength(3);
  });
});

// ─── period index & ranges ─────────────────────────────────────────
describe("getPeriodIndex", () => {
  it("counts 7-day blocks for weekly duties", () => {
    const w = duty({ period: "weekly", rotationStartDate: "2026-06-01" });
    expect(getPeriodIndex(w, "2026-06-01")).toBe(0);
    expect(getPeriodIndex(w, "2026-06-08")).toBe(1);
    expect(getPeriodIndex(w, "2026-06-21")).toBe(2);
  });

  it("counts calendar months for monthly duties (day-independent)", () => {
    const m = duty({ period: "monthly", rotationStartDate: "2026-01-15" });
    expect(getPeriodIndex(m, "2026-01-31")).toBe(0);
    expect(getPeriodIndex(m, "2026-03-01")).toBe(2);
    expect(getPeriodIndex(m, "2026-03-20")).toBe(2);
  });
});

describe("getPeriodRangeForIndex / getPeriodRange", () => {
  it("returns a 7-day window for weekly duties", () => {
    const w = duty({ period: "weekly", rotationStartDate: "2026-06-01" });
    expect(getPeriodRangeForIndex(w, 0)).toEqual({
      start: "2026-06-01",
      end: "2026-06-07",
    });
    expect(getPeriodRangeForIndex(w, 2)).toEqual({
      start: "2026-06-15",
      end: "2026-06-21",
    });
  });

  it("returns whole calendar months for monthly duties", () => {
    const m = duty({ period: "monthly", rotationStartDate: "2026-01-15" });
    expect(getPeriodRangeForIndex(m, 0)).toEqual({
      start: "2026-01-01",
      end: "2026-01-31",
    });
    expect(getPeriodRangeForIndex(m, 1)).toEqual({
      start: "2026-02-01",
      end: "2026-02-28",
    });
  });

  it("clamps negative indexes to 0", () => {
    const w = duty({ period: "weekly", rotationStartDate: "2026-06-01" });
    expect(getPeriodRangeForIndex(w, -5)).toEqual(getPeriodRangeForIndex(w, 0));
  });

  it("getPeriodRange resolves the window containing a date", () => {
    const w = duty({ period: "weekly", rotationStartDate: "2026-06-01" });
    expect(getPeriodRange(w, "2026-06-17")).toEqual({
      start: "2026-06-15",
      end: "2026-06-21",
    });
  });
});

// ─── resolveDutyPool ───────────────────────────────────────────────
describe("resolveDutyPool", () => {
  it("includes only employees the admin selected (memberEmpIds)", () => {
    const employees = [
      emp("a", { displayOrder: 2 }),
      emp("b", { displayOrder: 1 }),
      emp("c"),
    ];
    const d = duty({ memberEmpIds: ["a", "b"] });
    // c ไม่ได้ถูกเลือก → ไม่อยู่ใน pool · เรียงตาม displayOrder ไม่ใช่ลำดับใน array
    expect(resolveDutyPool(d, employees).map((e) => e.id)).toEqual(["b", "a"]);
  });

  it("skips member ids that no longer exist (deleted employees)", () => {
    const d = duty({ memberEmpIds: ["a", "ghost"] });
    expect(resolveDutyPool(d, [emp("a")]).map((e) => e.id)).toEqual(["a"]);
  });

  it("empty / missing memberEmpIds → empty pool", () => {
    expect(resolveDutyPool(duty({ memberEmpIds: [] }), [emp("a")])).toEqual([]);
    expect(
      resolveDutyPool(duty({ memberEmpIds: undefined }), [emp("a")]),
    ).toEqual([]);
  });

  it("sorts by displayOrder asc, then Thai name", () => {
    const employees = [
      emp("x", { displayOrder: 3 }),
      emp("y", { displayOrder: 1 }),
      emp("z", { displayOrder: 2 }),
    ];
    expect(resolveDutyPool(duty(), employees).map((e) => e.id)).toEqual([
      "y",
      "z",
      "x",
    ]);
  });
});

// ─── pickPrimary ───────────────────────────────────────────────────
describe("pickPrimary", () => {
  const d = duty({ id: "pp" });

  it("returns null for an empty pool", () => {
    expect(pickPrimary(d, [], 0, new Set())).toBeNull();
  });

  it("is deterministic for the same inputs", () => {
    const pool = ["a", "b", "c"];
    expect(pickPrimary(d, pool, 3, new Set())).toBe(
      pickPrimary(d, pool, 3, new Set()),
    );
  });

  it("skips collisions: a used candidate is passed over for a free one", () => {
    const pool = ["a", "b", "c"];
    const first = pickPrimary(d, pool, 0, new Set())!;
    const second = pickPrimary(d, pool, 0, new Set([first]));
    expect(second).not.toBe(first);
    expect(pool).toContain(second);
  });

  it("uses a valid cache (matching periodIndex, in pool, not used)", () => {
    const pool = ["a", "b", "c"];
    const cached = duty({
      id: "pp",
      cachedPrimary: { periodIndex: 5, empId: "b" },
    });
    expect(pickPrimary(cached, pool, 5, new Set())).toBe("b");
  });

  it("ignores a stale cache (wrong periodIndex) and falls back to the hash pick", () => {
    const pool = ["a", "b", "c"];
    const noCache = pickPrimary(d, pool, 2, new Set());
    const stale = pickPrimary(
      duty({ id: "pp", cachedPrimary: { periodIndex: 99, empId: "c" } }),
      pool,
      2,
      new Set(),
    );
    expect(stale).toBe(noCache);
  });

  it("ignores a cache whose empId left the pool", () => {
    const pool = ["a", "b", "c"];
    const noCache = pickPrimary(d, pool, 2, new Set());
    const ghost = pickPrimary(
      duty({ id: "pp", cachedPrimary: { periodIndex: 2, empId: "ghost" } }),
      pool,
      2,
      new Set(),
    );
    expect(ghost).toBe(noCache);
  });

  it("allows a repeat when every candidate is already used (duties > people)", () => {
    expect(pickPrimary(d, ["a"], 0, new Set(["a"]))).toBe("a");
  });

  it("rotationStartEmpId anchors the first period to the chosen person", () => {
    const pool = ["a", "b", "c"];
    const anchored = duty({ id: "pp", rotationStartEmpId: "c" });
    expect(pickPrimary(anchored, pool, 0, new Set())).toBe("c");
  });

  it("rotation continues in pool order from the chosen start person", () => {
    const pool = ["a", "b", "c"];
    const anchored = duty({ id: "pp", rotationStartEmpId: "b" });
    // เริ่มที่ b (idx1) แล้วหมุน: idx0=b, idx1=c, idx2=a, idx3=b
    expect(pickPrimary(anchored, pool, 0, new Set())).toBe("b");
    expect(pickPrimary(anchored, pool, 1, new Set())).toBe("c");
    expect(pickPrimary(anchored, pool, 2, new Set())).toBe("a");
    expect(pickPrimary(anchored, pool, 3, new Set())).toBe("b");
  });

  it("falls back to the hash pick when rotationStartEmpId is not in the pool", () => {
    const pool = ["a", "b", "c"];
    const noAnchor = pickPrimary(d, pool, 4, new Set());
    const ghostAnchor = pickPrimary(
      duty({ id: "pp", rotationStartEmpId: "ghost" }),
      pool,
      4,
      new Set(),
    );
    expect(ghostAnchor).toBe(noAnchor);
  });

  it("empty rotationStartEmpId behaves like no anchor (backward compatible)", () => {
    const pool = ["a", "b", "c"];
    const noAnchor = pickPrimary(d, pool, 7, new Set());
    const emptyAnchor = pickPrimary(
      duty({ id: "pp", rotationStartEmpId: "" }),
      pool,
      7,
      new Set(),
    );
    expect(emptyAnchor).toBe(noAnchor);
  });
});

// ─── computeDutyForDay ─────────────────────────────────────────────
describe("computeDutyForDay", () => {
  const employees = [
    emp("a", { displayOrder: 1 }),
    emp("b", { displayOrder: 2 }),
    emp("c", { displayOrder: 3 }),
  ];
  const d = duty({ id: "cdd", period: "weekly" });
  const MON = "2026-06-08";

  it("returns empty_pool when no selected member exists", () => {
    const r = computeDutyForDay(
      duty({ id: "cdd", memberEmpIds: ["a", "b", "c"] }),
      MON,
      [emp("x")],
      [],
      new Set(),
      new Set(),
    );
    expect(r.reason).toBe("empty_pool");
    expect(r.actualEmpId).toBeNull();
  });

  it("assigns the precomputed primary when present and not on leave", () => {
    const r = computeDutyForDay(
      d,
      MON,
      employees,
      [],
      new Set(),
      new Set(),
      "a",
    );
    expect(r.reason).toBe("rotation");
    expect(r.primaryEmpId).toBe("a");
    expect(r.actualEmpId).toBe("a");
  });

  it("substitutes the next free coworker when the primary is on leave", () => {
    const r = computeDutyForDay(
      d,
      MON,
      employees,
      [leave("a", MON)],
      new Set(),
      new Set(),
      "a",
    );
    expect(r.reason).toBe("substitute_for_leave");
    expect(r.primaryEmpId).toBe("a");
    expect(r.actualEmpId).toBe("b");
  });

  it("doubles up when every free coworker is already on another duty", () => {
    // a on leave; b is busy elsewhere (primariesToday) → b chosen as double_up
    const r = computeDutyForDay(
      d,
      MON,
      [emp("a", { displayOrder: 1 }), emp("b", { displayOrder: 2 })],
      [leave("a", MON)],
      new Set(),
      new Set(["b"]),
      "a",
    );
    expect(r.reason).toBe("double_up");
    expect(r.actualEmpId).toBe("b");
  });

  it("reports all_on_leave when the whole pool is out", () => {
    const r = computeDutyForDay(
      d,
      MON,
      [emp("a", { displayOrder: 1 }), emp("b", { displayOrder: 2 })],
      [leave("a", MON), leave("b", MON)],
      new Set(),
      new Set(),
      "a",
    );
    expect(r.reason).toBe("all_on_leave");
    expect(r.actualEmpId).toBeNull();
  });
});

// ─── computeAllDutiesForDay ────────────────────────────────────────
describe("computeAllDutiesForDay", () => {
  const employees = [
    emp("a", { displayOrder: 1 }),
    emp("b", { displayOrder: 2 }),
  ];

  it("วันอาทิตย์: คนหลักไม่เลื่อนเมื่อหน้าที่ skipSundays หายไป (ตรงกับปฏิทินหน้าที่)", () => {
    // 4 หน้าที่ weekly pool เดียวกัน · ตัวแรกไม่ทำวันอาทิตย์ (skipSundays)
    // เดิม: วันอาทิตย์ตัวแรกถูก filter ออกก่อน assign → groupOffset ของที่เหลือ
    // เลื่อน 1 → คนหลักทุกตัวเปลี่ยนคนกลางสัปดาห์ + ไม่ตรงกับปฏิทิน (bug จริง)
    const emps = ["a", "b", "c", "d"].map((id, i) =>
      emp(id, { displayOrder: i + 1 }),
    );
    const ds = [
      duty({ id: "gift", skipSundays: true, createdAt: 0 }),
      duty({ id: "stock", createdAt: 1 }),
      duty({ id: "power", createdAt: 2 }),
      duty({ id: "door", createdAt: 3 }),
    ].map((d) => ({ ...d, rotationStartDate: "2026-01-05" }) as Duty);
    const pools = new Map(ds.map((d) => [d.id, ["a", "b", "c", "d"]]));
    const sunday = "2026-08-02";
    const calendarPrimaries = computeForecastPrimaries(ds, pools, sunday);
    const homeAssignments = computeAllDutiesForDay(ds, sunday, emps, []);
    // หน้าที่ skipSundays ต้องไม่โผล่วันอาทิตย์
    expect(homeAssignments.map((a) => a.dutyId)).not.toContain("gift");
    // ที่เหลือคนหลักต้องตรงกับปฏิทินเป๊ะ
    for (const a of homeAssignments) {
      expect(a.primaryEmpId).toBe(calendarPrimaries.get(a.dutyId));
    }
    // วันธรรมดายังตรงกันเหมือนเดิม (ไม่ regress)
    const friday = "2026-07-31";
    const calFri = computeForecastPrimaries(ds, pools, friday);
    for (const a of computeAllDutiesForDay(ds, friday, emps, [])) {
      expect(a.primaryEmpId).toBe(calFri.get(a.dutyId));
    }
  });

  it("returns nothing when the store is closed", () => {
    expect(
      computeAllDutiesForDay([duty()], "2026-06-06", employees, []),
    ).toEqual([]);
  });

  it("keeps monthly assignees out of weekly duties (no same-day double assignment)", () => {
    const monthly = duty({ id: "m", period: "monthly" });
    const weekly = duty({ id: "w", period: "weekly" });
    const res = computeAllDutiesForDay(
      [monthly, weekly],
      "2026-06-08",
      employees,
      [],
    );
    const byId = Object.fromEntries(res.map((r) => [r.dutyId, r.primaryEmpId]));
    expect(byId.m).not.toBe(byId.w);
    expect([byId.m, byId.w].sort()).toEqual(["a", "b"]);
  });

  it("excludes weekly+skipSundays duties on a Sunday", () => {
    const res = computeAllDutiesForDay(
      [duty({ id: "ws", period: "weekly", skipSundays: true })],
      "2026-06-07",
      employees,
      [],
    );
    expect(res).toEqual([]);
  });
});

// ─── monthlyPrimariesForDay ────────────────────────────────────────
describe("monthlyPrimariesForDay", () => {
  const employees = [
    emp("a", { displayOrder: 1 }),
    emp("b", { displayOrder: 2 }),
  ];

  it("returns the set of monthly primaries", () => {
    const set = monthlyPrimariesForDay(
      [duty({ id: "m", period: "monthly" })],
      "2026-06-08",
      employees,
    );
    expect(set.size).toBe(1);
    expect([...set][0]).toMatch(/^[ab]$/);
  });

  it("returns empty set when there are no monthly duties", () => {
    expect(monthlyPrimariesForDay([], "2026-06-08", employees).size).toBe(0);
  });
});

// ─── monthly rotation substitute — ไม่ซ้ำ (fairness history) ────────
describe("pickRotationSubstitute / replayRotationSubHistory", () => {
  const pool = ["a", "b", "c"];

  it("history เท่ากัน → เลือกคนถัดจาก primary (พฤติกรรมเดิม)", () => {
    expect(
      pickRotationSubstitute(
        pool,
        "a",
        "2026-07-08",
        [],
        new Set(),
        new Map(),
        new Set(),
      ),
    ).toBe("b");
  });

  it("เคยแทนน้อยสุดชนะ แม้อยู่ไกลกว่าในลำดับ", () => {
    const history = new Map([["b", 2]]);
    expect(
      pickRotationSubstitute(
        pool,
        "a",
        "2026-07-08",
        [],
        new Set(),
        history,
        new Set(),
      ),
    ).toBe("c");
  });

  it("ข้ามคนลา + คนติดหน้าที่อื่น (pass 1) · double-up ได้ (pass 2)", () => {
    expect(
      pickRotationSubstitute(
        pool,
        "a",
        "2026-07-08",
        [leave("b", "2026-07-08")],
        new Set(),
        new Map(),
        new Set(),
      ),
    ).toBe("c");
    // c ติดหน้าที่อื่น + b ลา → pass 2 ยอม double-up ที่ c
    expect(
      pickRotationSubstitute(
        pool,
        "a",
        "2026-07-08",
        [leave("b", "2026-07-08")],
        new Set(["c"]),
        new Map(),
        new Set(),
      ),
    ).toBe("c");
  });

  it("subExcluded — ข้ามคนที่ admin ตั้ง 'ไม่ให้เป็นคนแทน' ทั้ง 2 pass", () => {
    // b ปกติจะได้ (คนถัดจาก a) แต่ถูกตั้งไม่แทน → ได้ c
    expect(
      pickRotationSubstitute(
        pool,
        "a",
        "2026-07-08",
        [],
        new Set(),
        new Map(),
        new Set(["b"]),
      ),
    ).toBe("c");
    // b,c ถูกตั้งไม่แทน → ไม่มีใครแทน (แม้ทุกคนว่าง)
    expect(
      pickRotationSubstitute(
        pool,
        "a",
        "2026-07-08",
        [],
        new Set(),
        new Map(),
        new Set(["b", "c"]),
      ),
    ).toBeNull();
  });

  it("replay นับวันแทนในอดีต (เฉพาะวันร้านเปิด + primary ลาจริง)", () => {
    const m = duty({
      id: "m1",
      period: "monthly",
      rotationStartDate: "2026-07-01",
      rotationStartEmpId: "a",
    });
    // a (primary ก.ค.) ลา 2 วันทำการ → b, c ได้แทนคนละครั้ง
    const history = replayRotationSubHistory(
      m,
      pool,
      [leave("a", "2026-07-08"), leave("a", "2026-07-09")],
      null,
      "2026-07-01",
      "2026-07-15",
    );
    expect(history.get("b")).toBe(1);
    expect(history.get("c")).toBe(1);
    // เสาร์ (ร้านปิด) ไม่นับ
    const satOnly = replayRotationSubHistory(
      m,
      pool,
      [leave("a", "2026-07-11")], // เสาร์
      null,
      "2026-07-01",
      "2026-07-15",
    );
    expect(satOnly.size).toBe(0);
  });

  it("รองรับ weekly — นับวันแทนรายสัปดาห์ในอดีต (fair)", () => {
    const w = duty({
      id: "w1",
      period: "weekly",
      rotationStartDate: "2026-07-06", // จันทร์
      rotationStartEmpId: "a",
    });
    // a (คนหลักสัปดาห์แรก) ลา จ-อ → b, c แทนคนละวัน (fair · ไม่ใช่ b ทั้งคู่)
    const history = replayRotationSubHistory(
      w,
      pool,
      [leave("a", "2026-07-06"), leave("a", "2026-07-07")],
      null,
      "2026-07-06",
      "2026-07-13",
    );
    expect(history.get("b")).toBe(1);
    expect(history.get("c")).toBe(1);
  });
});

describe("computeDutyForecast — monthly substitute ไม่ซ้ำ", () => {
  const m = duty({
    id: "m1",
    period: "monthly",
    rotationStartDate: "2026-07-01",
    rotationStartEmpId: "a",
  });
  const pools = new Map([["m1", ["a", "b", "c"]]]);

  it("primary ลาคนละครั้งในเดือน → คนแทนหมุน b แล้ว c (ไม่ซ้ำ b,b)", () => {
    const [f] = computeDutyForecast([m], pools, "2026-07-01", "2026-07-31", [
      leave("a", "2026-07-08"),
      leave("a", "2026-07-21"),
    ]);
    expect(f.periods[0].coverage?.map((s) => s.substituteEmpId)).toEqual([
      "b",
      "c",
    ]);
  });

  it("ลาต่อเนื่องหลายวัน → สลับคนแทนรายวัน (ยุติธรรม)", () => {
    const [f] = computeDutyForecast([m], pools, "2026-07-01", "2026-07-31", [
      leave("a", "2026-07-08", "2026-07-10"),
    ]);
    expect(f.periods[0].coverage?.map((s) => s.substituteEmpId)).toEqual([
      "b",
      "c",
      "b",
    ]);
  });

  it("seed จากประวัติเดือนก่อน — คนที่แทนบ่อยแล้วไม่โดนเลือกก่อน", () => {
    // มิ.ย.: primary a ลา 2 วัน → b,c แทน (h=1 เท่ากัน) · ก.ค.: primary b
    // (rotation หมุน) · b ลา → eligible a(h0) vs c(h1) → a ชนะ
    // (แบบเดิม neighbor-scan จะได้ c ซ้ำ)
    const m6 = duty({
      id: "m1",
      period: "monthly",
      rotationStartDate: "2026-06-01",
      rotationStartEmpId: "a",
    });
    const leaves = [
      leave("a", "2026-06-10"),
      leave("a", "2026-06-11"),
      leave("b", "2026-07-08"),
    ];
    const [f] = computeDutyForecast(
      [m6],
      pools,
      "2026-07-01",
      "2026-07-31",
      leaves,
    );
    expect(f.periods[0].primaryEmpId).toBe("b");
    expect(f.periods[0].coverage?.map((s) => s.substituteEmpId)).toEqual(["a"]);
  });

  it("weekly ใช้ fair-pick — คนแทนสลับยุติธรรม (ไม่ใช่คนเดิมซ้ำ)", () => {
    const w = duty({
      id: "w1",
      period: "weekly",
      rotationStartDate: "2026-07-06", // จันทร์
      rotationStartEmpId: "a",
    });
    const wPools = new Map([["w1", ["a", "b", "c"]]]);
    const [f] = computeDutyForecast([w], wPools, "2026-07-06", "2026-07-12", [
      leave("a", "2026-07-08", "2026-07-09"),
    ]);
    // a (คนหลัก) ลา 2 วัน → b แทนวันแรก, c แทนวันที่สอง (กระจายยุติธรรม สลับกัน)
    expect(f.periods[0].coverage).toEqual([
      { start: "2026-07-08", end: "2026-07-08", substituteEmpId: "b" },
      { start: "2026-07-09", end: "2026-07-09", substituteEmpId: "c" },
    ]);
  });

  it("substituteExcludedEmpIds (monthly) — คนถูกตั้ง 'ไม่แทน' ไม่ถูกเลือก", () => {
    // b ปกติได้ทั้ง 2 ครั้ง (ไม่ · rotate b,c) แต่ตั้ง b=ไม่แทน → c แทนทั้งคู่
    const mEx = duty({
      id: "m1",
      period: "monthly",
      rotationStartDate: "2026-07-01",
      rotationStartEmpId: "a",
      substituteExcludedEmpIds: ["b"],
    });
    const [f] = computeDutyForecast([mEx], pools, "2026-07-01", "2026-07-31", [
      leave("a", "2026-07-08"),
      leave("a", "2026-07-21"),
    ]);
    expect(f.periods[0].coverage?.map((s) => s.substituteEmpId)).toEqual([
      "c",
      "c",
    ]);
  });

  it("substituteExcludedEmpIds (weekly) — ข้ามคนถูกตั้ง 'ไม่แทน'", () => {
    const wEx = duty({
      id: "w1",
      period: "weekly",
      rotationStartDate: "2026-07-06",
      rotationStartEmpId: "a",
      substituteExcludedEmpIds: ["b"],
    });
    const wPools = new Map([["w1", ["a", "b", "c"]]]);
    const [f] = computeDutyForecast([wEx], wPools, "2026-07-06", "2026-07-12", [
      leave("a", "2026-07-08"),
    ]);
    // b ถูกข้าม → c แทน
    expect(f.periods[0].coverage?.[0]?.substituteEmpId).toBe("c");
  });
});

// ─── coverage forecast ─────────────────────────────────────────────
describe("computeCoverageForecast", () => {
  const employees = [
    emp("t1", { displayOrder: 1 }), // coverage target
    emp("c1", { displayOrder: 1 }), // candidate
    emp("c2", { displayOrder: 2 }), // candidate
  ];
  const coverage = duty({
    id: "cov",
    name: "แทนบัญชี",
    kind: "coverage",
    period: "weekly",
    coverageTargetEmpIds: ["t1"],
    candidateEmpIds: ["c1", "c2"],
  });

  it("empty when there are no coverage duties", () => {
    expect(
      computeCoverageForecast(
        [duty()],
        employees,
        [],
        "2026-06-01",
        "2026-12-31",
      ),
    ).toEqual([]);
  });

  it("forecasts the fairest cover for a single future absence day", () => {
    const res = computeCoverageForecast(
      [coverage],
      employees,
      [leave("t1", "2026-06-10")],
      "2026-06-01",
      "2026-12-31",
    );
    expect(res).toEqual([
      {
        dutyId: "cov",
        dutyName: "แทนบัญชี",
        start: "2026-06-10",
        end: "2026-06-10",
        targetEmpId: "t1",
        substituteEmpId: "c1",
      },
    ]);
  });

  it("groups consecutive days into one range when the cover is the same", () => {
    // pool มีคนแทนคนเดียว → คนเดิมทั้งช่วง → 1 segment
    const res = computeCoverageForecast(
      [duty({ ...coverage, candidateEmpIds: ["c1"] })],
      [emp("t1"), emp("c1")],
      [leave("t1", "2026-06-10", "2026-06-12")],
      "2026-06-01",
      "2026-12-31",
    );
    expect(res).toEqual([
      {
        dutyId: "cov",
        dutyName: "แทนบัญชี",
        start: "2026-06-10",
        end: "2026-06-12",
        targetEmpId: "t1",
        substituteEmpId: "c1",
      },
    ]);
  });

  it("rotates cover across a multi-day absence (fairness) → split segments", () => {
    const res = computeCoverageForecast(
      [coverage],
      employees,
      [leave("t1", "2026-06-10", "2026-06-12")],
      "2026-06-01",
      "2026-12-31",
    );
    // เคยแทนน้อยสุดก่อน → c1, c2, c1 (สลับรายวันตามความยุติธรรม)
    expect(res.map((r) => r.substituteEmpId)).toEqual(["c1", "c2", "c1"]);
    expect(res.map((r) => `${r.start}/${r.end}`)).toEqual([
      "2026-06-10/2026-06-10",
      "2026-06-11/2026-06-11",
      "2026-06-12/2026-06-12",
    ]);
  });

  it("marks substituteEmpId null when no candidate is available", () => {
    const res = computeCoverageForecast(
      [duty({ ...coverage, candidateEmpIds: ["c1"] })],
      [emp("t1"), emp("c1")],
      [leave("t1", "2026-06-10"), leave("c1", "2026-06-10")], // คนแทนคนเดียวก็ลา
      "2026-06-01",
      "2026-12-31",
    );
    expect(res).toEqual([
      {
        dutyId: "cov",
        dutyName: "แทนบัญชี",
        start: "2026-06-10",
        end: "2026-06-10",
        targetEmpId: "t1",
        substituteEmpId: null,
      },
    ]);
  });

  it("excludes absence days before today (seed only, not shown)", () => {
    const res = computeCoverageForecast(
      [coverage],
      employees,
      [leave("t1", "2026-05-30", "2026-06-02")],
      "2026-06-01",
      "2026-12-31",
    );
    // เฉพาะ 06-01, 06-02 (>= today) แสดง · 05-30/05-31 เป็นแค่ seed history
    expect(res.every((r) => r.start >= "2026-06-01")).toBe(true);
    const days = [...new Set(res.flatMap((r) => [r.start, r.end]))].sort();
    expect(days).toEqual(["2026-06-01", "2026-06-02"]);
  });

  it("ไม่ forecast คนแทนวันเสาร์ที่ร้านปิด (ลาคร่อมเสาร์)", () => {
    // t1 ลา ศ 06-12 – อา 06-14 · เสาร์ 06-13 ปิด → forecast แค่ ศ + อา (ข้ามเสาร์)
    const res = computeCoverageForecast(
      [duty({ ...coverage, candidateEmpIds: ["c1"] })],
      [emp("t1"), emp("c1")],
      [leave("t1", "2026-06-12", "2026-06-14")],
      "2026-06-01",
      "2026-12-31",
    );
    // เสาร์ 06-13 ไม่โผล่ → 2 segment แยก (ศ กับ อา)
    expect(res.map((r) => `${r.start}/${r.end}`)).toEqual([
      "2026-06-12/2026-06-12",
      "2026-06-14/2026-06-14",
    ]);
  });

  it("forecast คนแทนวันเสาร์ถ้าเปิดพิเศษ (extraOpenSaturdays)", () => {
    // เสาร์ 06-13 เปิดพิเศษ → ศ-อา ต่อเนื่อง (คนแทนคนเดียว) = 1 segment
    const res = computeCoverageForecast(
      [duty({ ...coverage, candidateEmpIds: ["c1"] })],
      [emp("t1"), emp("c1")],
      [leave("t1", "2026-06-12", "2026-06-14")],
      "2026-06-01",
      "2026-12-31",
      { extraOpenSaturdays: ["2026-06-13"], extraClosedWeekdays: [] },
    );
    expect(res.map((r) => `${r.start}/${r.end}`)).toEqual([
      "2026-06-12/2026-06-14",
    ]);
  });
});

// ─── forecast ──────────────────────────────────────────────────────
describe("computeForecastPrimaries", () => {
  it("assigns a primary per duty, with monthly locking out weekly overlap", () => {
    const monthly = duty({ id: "m", period: "monthly" });
    const weekly = duty({ id: "w", period: "weekly" });
    const pools = new Map([
      ["m", ["a", "b"]],
      ["w", ["a", "b"]],
    ]);
    const res = computeForecastPrimaries(
      [monthly, weekly],
      pools,
      "2026-06-08",
    );
    expect(res.get("m")).not.toBe(res.get("w"));
  });

  it("yields null for a duty with an empty pool", () => {
    const res = computeForecastPrimaries(
      [duty({ id: "w" })],
      new Map([["w", []]]),
      "2026-06-08",
    );
    expect(res.get("w")).toBeNull();
  });
});

describe("computeDutyForecast", () => {
  it("builds a per-period timeline from today through the end date", () => {
    const w = duty({
      id: "w",
      period: "weekly",
      rotationStartDate: "2026-06-01",
    });
    const pools = new Map([["w", ["a", "b"]]]);
    const [forecast] = computeDutyForecast(
      [w],
      pools,
      "2026-06-01",
      "2026-06-21",
    );
    expect(forecast.periods.map((p) => p.start)).toEqual([
      "2026-06-01",
      "2026-06-08",
      "2026-06-15",
    ]);
    expect(forecast.periods.every((p) => p.primaryEmpId !== null)).toBe(true);
  });

  it("excludes coverage duties from the forecast", () => {
    const cov = duty({ id: "cov", kind: "coverage", period: "weekly" });
    const res = computeDutyForecast(
      [cov],
      new Map([["cov", ["a"]]]),
      "2026-06-01",
      "2026-06-21",
    );
    expect(res).toEqual([]);
  });
});

describe("assignPrimaries — Latin square (หน้าที่ pool เดียวกันไม่ซ้ำเร็ว)", () => {
  it("3 weekly duties sharing a 5-person pool: each cycles all 5, no early repeat, no same-week collision", () => {
    const pool5 = ["a", "b", "c", "d", "e"];
    const ds = ["d1", "d2", "d3"].map((id) =>
      duty({ id, period: "weekly", rotationStartDate: "2026-01-05" }),
    );
    const pools = new Map(ds.map((d) => [d.id, pool5]));
    // 5 สัปดาห์ต่อเนื่อง (period index 0..4)
    const weeks = [
      "2026-01-05",
      "2026-01-12",
      "2026-01-19",
      "2026-01-26",
      "2026-02-02",
    ];
    const perDuty = new Map<string, (string | null)[]>(
      ds.map((d) => [d.id, []]),
    );
    for (const wk of weeks) {
      const m = computeForecastPrimaries(ds, pools, wk);
      for (const d of ds) perDuty.get(d.id)?.push(m.get(d.id) ?? null);
    }
    // แต่ละหน้าที่: 5 สัปดาห์ = 5 คนไม่ซ้ำ (วนครบก่อนซ้ำ)
    for (const d of ds) {
      expect(new Set(perDuty.get(d.id)).size).toBe(5);
    }
    // แต่ละสัปดาห์: 3 หน้าที่ = คนละคน (ไม่ชนกัน)
    for (let w = 0; w < weeks.length; w++) {
      const people = ds.map((d) => perDuty.get(d.id)?.[w]);
      expect(new Set(people).size).toBe(3);
    }
  });
});

describe("computeDutyCounts", () => {
  it("นับจำนวนครั้งต่อคน + ยุติธรรมในเดือน (หน้าที่เดี่ยว)", () => {
    const w = duty({
      id: "w",
      period: "weekly",
      rotationStartDate: "2026-08-03",
    });
    const counts = computeDutyCounts(
      [w],
      new Map([["w", ["a", "b", "c"]]]),
      "2026-08-01",
      "2026-08-31",
    ).get("w");
    if (!counts) throw new Error("no counts");
    expect(counts.size).toBe(3); // ทุกคนได้ทำ
    const vals = [...counts.values()];
    expect(Math.max(...vals) - Math.min(...vals)).toBeLessThanOrEqual(1);
  });
});

describe("computeDutyDayActivity", () => {
  const employees = [
    emp("t1", { displayOrder: 1 }), // coverage target
    emp("c1", { displayOrder: 1 }),
    emp("c2", { displayOrder: 2 }),
  ];
  const cov = (over: Partial<Duty> = {}) =>
    duty({
      id: "cov",
      kind: "coverage",
      period: "weekly",
      coverageTargetEmpIds: ["t1"],
      candidateEmpIds: ["c1", "c2"],
      ...over,
    });

  it("coverage substitute: นับวัน + แทนใคร (target = คนที่ลา)", () => {
    const leaves = [leave("t1", "2026-03-10"), leave("t1", "2026-03-11")];
    const sub = computeDutyDayActivity(
      [cov()],
      new Map(),
      leaves,
      null,
      "2026-01-01",
      "2026-03-31",
      employees,
    ).get("cov")?.substitute;
    if (!sub) throw new Error("no counts");
    // แต่ละคนแทน t1 คนละ 1 วัน — byTarget เก็บว่า "แทน t1" · datesByTarget
    // เก็บว่าวันไหน (UI กางดูรายวันได้)
    expect(sub.get("c1")).toEqual({
      days: 1,
      byTarget: new Map([["t1", 1]]),
      datesByTarget: new Map([["t1", ["2026-03-10"]]]),
    });
    expect(sub.get("c2")).toEqual({
      days: 1,
      byTarget: new Map([["t1", 1]]),
      datesByTarget: new Map([["t1", ["2026-03-11"]]]),
    });
  });

  it("substitute: รวมวันแทน target เดิมหลายวัน (byTarget)", () => {
    const one = cov({ candidateEmpIds: ["c1"] });
    const leaves = [leave("t1", "2026-03-10", "2026-03-12")];
    expect(
      computeDutyDayActivity(
        [one],
        new Map(),
        leaves,
        null,
        "2026-01-01",
        "2026-03-31",
        employees,
      )
        .get("cov")
        ?.substitute.get("c1"),
    ).toEqual({
      days: 3,
      byTarget: new Map([["t1", 3]]),
      // **เรียงเก่า→ใหม่** — UI เอาไปโชว์ตรงๆ ไม่ต้อง sort ซ้ำ
      datesByTarget: new Map([
        ["t1", ["2026-03-10", "2026-03-11", "2026-03-12"]],
      ]),
    });
  });

  it("**จำนวนวันใน byTarget ต้องเท่ากับจำนวนวันที่เก็บไว้เสมอ** (กันเลขกับรายวันหลุดจากกัน)", () => {
    const one = cov({ candidateEmpIds: ["c1"] });
    const leaves = [
      leave("t1", "2026-03-10", "2026-03-12"),
      leave("t1", "2026-03-20"),
    ];
    const sub = computeDutyDayActivity(
      [one],
      new Map(),
      leaves,
      null,
      "2026-01-01",
      "2026-03-31",
      employees,
    )
      .get("cov")
      ?.substitute.get("c1");
    if (!sub) throw new Error("no counts");
    let total = 0;
    for (const [targetId, n] of sub.byTarget) {
      expect(sub.datesByTarget.get(targetId)).toHaveLength(n);
      total += n;
    }
    expect(total).toBe(sub.days);
  });

  it("นับเฉพาะที่ทำแล้ว — วันลาหลัง toYmd (ล่วงหน้า) ไม่ถูกนับ", () => {
    const leaves = [leave("t1", "2026-03-10"), leave("t1", "2026-03-25")];
    const sub = computeDutyDayActivity(
      [cov()],
      new Map(),
      leaves,
      null,
      "2026-01-01",
      "2026-03-15",
      employees,
    ).get("cov")?.substitute;
    if (!sub) throw new Error("no counts");
    const days = [...sub.values()].reduce((s, c) => s + c.days, 0);
    expect(days).toBe(1); // 03-10 เท่านั้น (03-25 ล่วงหน้า)
  });

  it("rotation คนหลักรายวัน: นับเฉพาะวันที่อยู่ทำจริง (วันลาไม่นับ)", () => {
    // 2026-08-03..07 = จ-ศ (เปิด) · duty เดี่ยว pool [a,b,c] · primary รอบ 0 = a
    const w = duty({
      id: "w",
      period: "weekly",
      rotationStartDate: "2026-08-03",
    });
    // a เป็นคนหลัก · ลา 03,04 → อยู่ทำจริง 3 วัน (05,06,07) · คนแทน 2 วัน
    const act = computeDutyDayActivity(
      [w],
      new Map([["w", ["a", "b", "c"]]]),
      [leave("a", "2026-08-03", "2026-08-04")],
      null,
      "2026-08-03",
      "2026-08-07",
    ).get("w");
    if (!act) throw new Error("no activity");
    expect(act.primaryDays.get("a")).toBe(3); // 5 วันทำการ − 2 วันลา
    // คนแทน 2 วัน (03,04) · คนที่ลา (a) ไม่ถูกนับเป็นคนแทน
    const subDays = [...act.substitute.values()].reduce(
      (s, c) => s + c.days,
      0,
    );
    expect(subDays).toBe(2);
    expect(act.substitute.has("a")).toBe(false);
    // คนแทนกระจายยุติธรรม — b แทน a วันแรก, c แทน a วันที่สอง (สลับ ไม่ใช่ b ทั้ง 2)
    expect(act.substitute.get("b")?.byTarget.get("a")).toBe(1);
    expect(act.substitute.get("c")?.byTarget.get("a")).toBe(1);
  });

  it("คนแทน: ข้ามคนที่ตั้ง 'ไม่ให้เป็นคนแทน' (substituteExcludedEmpIds)", () => {
    // pool [a,b,c] · primary รอบ 0 = a ลา 08-05 · b ถูกตั้งไม่ให้เป็นคนแทน
    // → คนถัดไป c มาแทน (ไม่ใช่ b) · b ต้องไม่โผล่ในคนแทน
    const w = duty({
      id: "w",
      period: "weekly",
      rotationStartDate: "2026-08-03",
      substituteExcludedEmpIds: ["b"],
    });
    const act = computeDutyDayActivity(
      [w],
      new Map([["w", ["a", "b", "c"]]]),
      [leave("a", "2026-08-05")],
      null,
      "2026-08-03",
      "2026-08-07",
    ).get("w");
    if (!act) throw new Error("no activity");
    expect(act.substitute.has("b")).toBe(false); // b ไม่ถูกเลือกเป็นคนแทน
    expect(act.substitute.get("c")?.byTarget.get("a")).toBe(1); // c แทน a 1 วัน
  });

  it("คนแทนรายเดือน: กระจายยุติธรรม 'เคยแทนน้อยสุดก่อน' (ตรงกับ assignment จริง)", () => {
    // monthly duty · pool [a,b,c] · primary ก.ค. = a (rotationStartEmpId) ·
    // a ลา 4 วันทำการ (จ-พฤ) → คนแทนกระจาย b,c คนละ 2 วัน (fair) — ไม่ใช่
    // neighbor-scan ที่เทให้ b คนเดียว 4 วัน (เดิม forecast tab นับผิดแบบนี้)
    const m = duty({
      id: "m",
      period: "monthly",
      rotationStartDate: "2026-07-01",
      rotationStartEmpId: "a",
    });
    const leaves = [
      leave("a", "2026-07-06"), // จ
      leave("a", "2026-07-07"), // อ
      leave("a", "2026-07-08"), // พ
      leave("a", "2026-07-09"), // พฤ
    ];
    const act = computeDutyDayActivity(
      [m],
      new Map([["m", ["a", "b", "c"]]]),
      leaves,
      null,
      "2026-07-01",
      "2026-07-31",
    ).get("m");
    if (!act) throw new Error("no activity");
    // b, c แทน a คนละ 2 วัน (ยุติธรรม) — ไม่ใช่ b 4 / c 0
    expect(act.substitute.get("b")?.days).toBe(2);
    expect(act.substitute.get("c")?.days).toBe(2);
    expect(act.substitute.get("b")?.byTarget.get("a")).toBe(2);
    expect(act.substitute.get("c")?.byTarget.get("a")).toBe(2);
  });

  it("คนแทนรายสัปดาห์: กระจายยุติธรรม 'เคยแทนน้อยสุดก่อน' (ไม่ใช่ neighbor ซ้ำ)", () => {
    // weekly · pool [a,b,c] · คนหลักสัปดาห์นี้ = a · a ลา 2 วัน → b, c แทนคนละ 1
    // (fair) ไม่ใช่ b ทั้ง 2 วันแบบ neighbor-scan เดิม
    const w = duty({
      id: "w",
      period: "weekly",
      rotationStartDate: "2026-08-03",
      rotationStartEmpId: "a",
    });
    const act = computeDutyDayActivity(
      [w],
      new Map([["w", ["a", "b", "c"]]]),
      [leave("a", "2026-08-03"), leave("a", "2026-08-04")],
      null,
      "2026-08-03",
      "2026-08-07",
    ).get("w");
    if (!act) throw new Error("no activity");
    expect(act.substitute.get("b")?.days).toBe(1);
    expect(act.substitute.get("c")?.days).toBe(1);
  });

  it("คนแทนรายสัปดาห์ไม่เลือกคนหลักรายเดือน (รายเดือนไม่แทนรายสัปดาห์)", () => {
    // role เดียว [a,b,c] · monthly M (คนหลัก = a ล็อกทั้งเดือน) + weekly W
    // คนหลัก weekly หมุนใน [b,c] · เมื่อคนหลัก weekly ลา คนแทนต้องเป็นอีกคนใน
    // [b,c] — ไม่ใช่ a (คนหลักรายเดือน) แม้ a จะว่าง
    const m = duty({
      id: "m",
      period: "monthly",
      rotationStartDate: "2026-08-01",
      rotationStartEmpId: "a",
    });
    const w = duty({
      id: "w",
      period: "weekly",
      rotationStartDate: "2026-08-03",
    });
    const pools = new Map([
      ["m", ["a", "b", "c"]],
      ["w", ["a", "b", "c"]],
    ]);
    // คนหลัก weekly (a ถูกล็อกเป็นรายเดือน → primary weekly = b หรือ c)
    const wPrimary = computeForecastPrimaries([m, w], pools, "2026-08-03").get(
      "w",
    );
    if (!wPrimary) throw new Error("no weekly primary");
    // คนหลัก weekly ลาทั้งสัปดาห์ → ต้องมีคนแทน (อีกคนใน b,c) · a ต้องไม่ถูกเลือก
    const act = computeDutyDayActivity(
      [m, w],
      pools,
      [leave(wPrimary, "2026-08-03", "2026-08-07")],
      null,
      "2026-08-03",
      "2026-08-07",
    ).get("w");
    expect(act?.substitute.has("a")).toBe(false); // a = คนหลักรายเดือน ไม่แทน weekly
    const subEmps = [...(act?.substitute.keys() ?? [])];
    expect(subEmps.length).toBeGreaterThan(0); // มีคนแทนจริง (ไม่ใช่ "ไม่มีคนแทน")
    expect(subEmps).not.toContain("a");
  });

  it("ไม่นับวันก่อน rotationStartDate — หน้าที่ยังไม่เริ่มหมุน (กันคนหลักบวม)", () => {
    // duty เริ่มหมุน 2026-08-03 แต่ replay ตั้งแต่ 2026-06-01 → วันก่อนเริ่ม
    // (มิ.ย.-ก.ค.) periodIndex ติดลบถูก clamp เป็น 0 ทุกวัน · ถ้าไม่ gate คนหลัก
    // รอบ 0 (a) จะถูกนับเป็นคนหลักทุกวันย้อนหลัง (บวมเกินจริง)
    const w = duty({
      id: "w",
      period: "weekly",
      rotationStartDate: "2026-08-03",
    });
    const act = computeDutyDayActivity(
      [w],
      new Map([["w", ["a", "b", "c"]]]),
      [],
      null,
      "2026-06-01", // ก่อน rotationStartDate 2 เดือน
      "2026-08-07", // จ-ศ สัปดาห์แรกที่เริ่มหมุน
    ).get("w");
    if (!act) throw new Error("no activity");
    // นับเฉพาะสัปดาห์แรกจริง (03-07 = 5 วันทำการ) → a เป็นคนหลักรอบ 0 = 5 วัน
    // (ไม่ใช่ ~50 วันจากการนับ มิ.ย.-ก.ค. ที่หน้าที่ยังไม่เริ่ม)
    expect(act.primaryDays.get("a")).toBe(5);
    const totalPrimaryDays = [...act.primaryDays.values()].reduce(
      (s, n) => s + n,
      0,
    );
    expect(totalPrimaryDays).toBe(5);
  });

  it("คนหลัก vs คนแทน แยกกัน ไม่นับวันซ้ำ (รวม = จำนวนวันเปิดร้าน)", () => {
    // 08-03..07 = จ-ศ เปิด 5 วัน · pool [a,b,c] · primary รอบ 0 = a
    // a (คนหลัก) ลา 08-05 วันเดียว → วันนั้นเป็น "คนแทน" (คนอื่น) ไม่ใช่ "คนหลัก"
    // invariant: ทุกวันเปิดถูกนับ "ครั้งเดียว" — คนหลัก + คนแทน = 5 (ไม่ซ้ำ/ไม่เกิน)
    const w = duty({
      id: "w",
      period: "weekly",
      rotationStartDate: "2026-08-03",
    });
    const act = computeDutyDayActivity(
      [w],
      new Map([["w", ["a", "b", "c"]]]),
      [leave("a", "2026-08-05")],
      null,
      "2026-08-03",
      "2026-08-07",
    ).get("w");
    if (!act) throw new Error("no activity");
    const primTotal = [...act.primaryDays.values()].reduce((s, n) => s + n, 0);
    const subTotal = [...act.substitute.values()].reduce(
      (s, c) => s + c.days,
      0,
    );
    expect(primTotal + subTotal).toBe(5); // ทุกวันเปิดนับครั้งเดียว
    expect(primTotal).toBe(4); // a อยู่ทำ 4 วัน (เว้น 08-05)
    expect(subTotal).toBe(1); // 08-05 คนแทน 1 วัน
    expect(act.primaryDays.get("a")).toBe(4); // วันที่ a ลาไม่นับเป็นคนหลัก
    expect(act.substitute.has("a")).toBe(false); // a ลา → ไม่ใช่คนแทนวันนั้น
  });

  it("คนหลัก: ไม่นับวันเสาร์ที่ร้านปิด (เสาร์ = ปิด default)", () => {
    // 08-03..08 = จ-ส · เสาร์ 08-08 ปิด → นับเฉพาะ จ-ศ = 5 วัน (ไม่ใช่ 6)
    const w = duty({
      id: "w",
      period: "weekly",
      rotationStartDate: "2026-08-03",
    });
    const act = computeDutyDayActivity(
      [w],
      new Map([["w", ["a"]]]),
      [],
      null,
      "2026-08-03",
      "2026-08-08",
    ).get("w");
    expect(act?.primaryDays.get("a")).toBe(5);
  });

  it("คนหลัก: นับวันเสาร์ถ้าเปิดพิเศษ (extraOpenSaturdays)", () => {
    // เสาร์ 08-08 อยู่ใน extraOpenSaturdays → เปิด → นับ จ-ศ (5) + เสาร์ (1) = 6
    const w = duty({
      id: "w",
      period: "weekly",
      rotationStartDate: "2026-08-03",
    });
    const act = computeDutyDayActivity(
      [w],
      new Map([["w", ["a"]]]),
      [],
      { extraOpenSaturdays: ["2026-08-08"], extraClosedWeekdays: [] },
      "2026-08-03",
      "2026-08-08",
    ).get("w");
    expect(act?.primaryDays.get("a")).toBe(6);
  });

  it("คนแทน (coverage): ไม่นับวันเสาร์ที่ร้านปิด (ลาคร่อมเสาร์)", () => {
    // t1 (เป้าหมาย) ลา พฤ 08-06 – ส 08-08 (คร่อมเสาร์) · เสาร์ปิด → คนแทนนับแค่
    // พฤ,ศ = 2 วัน (ไม่รวมเสาร์ 08-08 ที่ร้านปิด)
    const leaves = [leave("t1", "2026-08-06", "2026-08-08")];
    const sub = computeDutyDayActivity(
      [cov()],
      new Map(),
      leaves,
      null,
      "2026-08-01",
      "2026-08-08",
      employees,
    ).get("cov")?.substitute;
    const days = [...(sub?.values() ?? [])].reduce((s, c) => s + c.days, 0);
    expect(days).toBe(2);
  });

  it("rotation ทำงานได้จาก poolByDutyId โดยไม่มี employees (ฝั่งพนักงาน)", () => {
    // ฝั่งพนักงานไม่มี employees แต่มี pool จาก snapshot → คนหลัก weekly ยังนับได้
    const w = duty({
      id: "w",
      period: "weekly",
      rotationStartDate: "2026-08-03",
    });
    const act = computeDutyDayActivity(
      [w],
      new Map([["w", ["a", "b", "c"]]]),
      [],
      null,
      "2026-08-03",
      "2026-08-07",
      // ไม่ส่ง employees
    ).get("w");
    expect(act?.primaryDays.get("a")).toBe(5); // จ-ศ 5 วัน
  });

  it("คนหลักรายสัปดาห์ไม่ flicker กลางสัปดาห์ตอนข้ามเดือน (ตรงกับย้อนหลัง)", () => {
    // pool [a,b] · weekly W + monthly M ใช้ pool เดียวกัน · monthly เปลี่ยน
    // คนหลักข้ามเดือน → ถ้าคิดแบบรายวัน (de-collision) คนหลัก weekly จะสลับ
    // กลางสัปดาห์ที่คร่อมเดือน (โผล่คนที่ย้อนหลังไม่มี) · แบบรอบต้องเป็นคนเดียว
    const m = duty({
      id: "m",
      period: "monthly",
      rotationStartDate: "2026-01-01",
    });
    const w = duty({
      id: "w",
      period: "weekly",
      rotationStartDate: "2026-01-01",
    });
    // สัปดาห์ 29 ม.ค. – 4 ก.พ. 2026 คร่อมเดือน (period index 4 ของ w)
    const act = computeDutyDayActivity(
      [m, w],
      new Map([
        ["m", ["a", "b"]],
        ["w", ["a", "b"]],
      ]),
      [],
      null,
      "2026-01-29",
      "2026-02-04",
    ).get("w");
    if (!act) throw new Error("no activity");
    // คนหลัก weekly ต้องเป็นคนเดียวทั้งสัปดาห์ (ไม่แตกเป็น 2 คน)
    expect(act.primaryDays.size).toBe(1);
  });
});

describe("computeDutyHistory", () => {
  const SIX = ["a", "b", "c", "d", "e", "f"];

  it("returns only past periods within the from–today window", () => {
    const w = duty({
      id: "w",
      period: "weekly",
      rotationStartDate: "2026-01-05",
    });
    const [h] = computeDutyHistory(
      [w],
      new Map([["w", SIX]]),
      "2026-05-01",
      "2026-07-13",
    );
    expect(h.periods.length).toBeGreaterThan(0);
    // ทุกช่วงเป็นอดีต (เริ่มก่อนวันนี้) + ไม่หลุดก่อน from
    expect(h.periods.every((p) => p.start < "2026-07-13")).toBe(true);
    expect(h.periods.every((p) => p.end >= "2026-05-01")).toBe(true);
  });

  it("single weekly duty + 6 people → ไม่ซ้ำใน 6 รอบต่อเนื่อง (fairness)", () => {
    const w = duty({
      id: "w",
      period: "weekly",
      rotationStartDate: "2026-01-05",
    });
    const [h] = computeDutyHistory(
      [w],
      new Map([["w", SIX]]),
      "2026-01-05",
      "2026-07-13",
    );
    const byIdx = [...h.periods].sort((a, b) => a.index - b.index);
    for (let i = 0; i + 6 <= byIdx.length; i++) {
      const names = byIdx.slice(i, i + 6).map((p) => p.primaryEmpId);
      expect(new Set(names).size).toBe(6); // ครบ 6 คนไม่ซ้ำ
    }
  });

  it("excludes coverage duties", () => {
    const cov = duty({ id: "cov", kind: "coverage", period: "weekly" });
    expect(
      computeDutyHistory(
        [cov],
        new Map([["cov", ["a"]]]),
        "2026-05-01",
        "2026-07-13",
      ),
    ).toEqual([]);
  });
});

describe("computeDutyForecast — coverage (คนแทนตอน primary ลา)", () => {
  // 2026-06-01 = จันทร์ · สัปดาห์แรก 06-01..06-07 (เสาร์ = 06-06)
  const w = duty({
    id: "w",
    period: "weekly",
    rotationStartDate: "2026-06-01",
  });
  const pools = new Map([["w", ["a", "b"]]]);
  // primary ของสัปดาห์แรก (a หรือ b ขึ้นกับ hash) — หาแบบ dynamic
  const primaryOfWeek1 = computeDutyForecast(
    [w],
    pools,
    "2026-06-01",
    "2026-06-07",
  )[0].periods[0].primaryEmpId as string;
  const otherEmp = primaryOfWeek1 === "a" ? "b" : "a";

  it("ไม่มี coverage ถ้าไม่ส่ง leaves (rotation ล้วน เหมือนเดิม)", () => {
    const [f] = computeDutyForecast([w], pools, "2026-06-01", "2026-06-07");
    expect(f.periods[0].coverage).toBeUndefined();
  });

  it("ใส่ coverage = คนอื่นแทน ช่วงวันที่ primary ลา (วันร้านเปิด)", () => {
    const leaves = [leave(primaryOfWeek1, "2026-06-02", "2026-06-03")];
    const [f] = computeDutyForecast(
      [w],
      pools,
      "2026-06-01",
      "2026-06-07",
      leaves,
    );
    expect(f.periods[0].coverage).toEqual([
      { start: "2026-06-02", end: "2026-06-03", substituteEmpId: otherEmp },
    ]);
  });

  it("ไม่มี coverage ถ้าคนที่ลาไม่ใช่ primary ของรอบนั้น", () => {
    const leaves = [leave(otherEmp, "2026-06-02", "2026-06-03")];
    const [f] = computeDutyForecast(
      [w],
      pools,
      "2026-06-01",
      "2026-06-07",
      leaves,
    );
    expect(f.periods[0].coverage).toBeUndefined();
  });

  it("substituteEmpId = null เมื่อทุกคนใน pool ลาวันนั้น (ไม่มีคนแทน)", () => {
    const leaves = [
      leave("a", "2026-06-02", "2026-06-02"),
      leave("b", "2026-06-02", "2026-06-02"),
    ];
    const [f] = computeDutyForecast(
      [w],
      pools,
      "2026-06-01",
      "2026-06-07",
      leaves,
    );
    expect(f.periods[0].coverage).toEqual([
      { start: "2026-06-02", end: "2026-06-02", substituteEmpId: null },
    ]);
  });

  it("ข้ามวันร้านปิด (เสาร์) — ลาเฉพาะเสาร์ → ไม่มี coverage", () => {
    const leaves = [leave(primaryOfWeek1, "2026-06-06", "2026-06-06")];
    const [f] = computeDutyForecast(
      [w],
      pools,
      "2026-06-01",
      "2026-06-07",
      leaves,
    );
    expect(f.periods[0].coverage).toBeUndefined();
  });
});

/* ─── หน้าที่ "ผูกขาดคนทำ" (Duty.exclusive) ─────────────────────────
   คนที่ทำหน้าที่ผูกขาดในวันนั้น — คนหลัก **หรือคนแทน** — ต้องไม่ถูกจัด
   หน้าที่อื่นเลยในวันเดียวกัน · งานที่เคยตกเป็นของเขากระจายไปให้คนอื่น    */
describe("computeAllDutiesForDay — หน้าที่ผูกขาด", () => {
  const staff = ["a", "b", "c", "d"].map((id) => emp(id));
  const MON = "2026-06-01"; // ตรงกับ rotationStartDate → periodIndex 0

  it("คนแทนหน้าที่ผูกขาด ไม่ถูกจัดหน้าที่อื่นในวันเดียวกัน", () => {
    const online = duty({
      id: "online",
      name: "ONLINE",
      exclusive: true,
      rotationStartEmpId: "a",
    });
    const others = ["x", "y", "z"].map((id) =>
      duty({ id, name: id, rotationStartEmpId: "b" }),
    );
    // คนหลักของ ONLINE (a) ลา → ต้องมีคนมาแทน
    const result = computeAllDutiesForDay(
      [online, ...others],
      MON,
      staff,
      [leave("a", MON)],
      null,
    );

    const onlineAssignment = result.find((r) => r.dutyId === "online");
    expect(onlineAssignment?.actualEmpId).toBeTruthy();
    expect(onlineAssignment?.actualEmpId).not.toBe("a");
    const substitute = onlineAssignment?.actualEmpId as string;

    // คนแทนต้องไม่ "ทำ" หน้าที่อื่นเลยในวันนั้น
    // (ยังเป็น "คนหลักตามเวร" ของหน้าที่อื่นได้ — เวรไม่เปลี่ยนมือเพราะติดงาน
    //  วันเดียว · ระบบจะหาคนมาแทนให้แล้วขึ้นป้าย "แทน X" ดูเทสต์ด้านล่าง)
    for (const other of result.filter((r) => r.dutyId !== "online")) {
      expect(other.actualEmpId).not.toBe(substitute);
    }
  });

  it("คนหลักที่ถูกดึงไปหน้าที่ผูกขาด → หน้าที่เดิมขึ้น 'แทน X' ไม่ใช่เวรของคนแทน", () => {
    // b เป็นคนหลักของ "x" · แต่ b ถูกดึงไปทำ ONLINE (ผูกขาด) แทน a ที่ลา
    // → "x" ต้องคง b ไว้เป็นคนหลัก แล้วให้คนอื่นมาแทน (ไม่ใช่ย้ายเวรให้คนแทน)
    const online = duty({
      id: "online",
      name: "ONLINE",
      exclusive: true,
      rotationStartEmpId: "a",
      // d ไม่ได้อยู่ในหน้าที่ ONLINE (ทำไม่ได้) → เหลือ b มาแทน a
      memberEmpIds: ["a", "b", "c"],
    });
    const x = duty({ id: "x", name: "x", rotationStartEmpId: "b" });
    const result = computeAllDutiesForDay(
      [online, x],
      MON,
      staff,
      [leave("a", MON), leave("c", MON)],
      null,
    );
    const onlineWorker = result.find((r) => r.dutyId === "online")?.actualEmpId;
    expect(onlineWorker).toBe("b");

    const xa = result.find((r) => r.dutyId === "x");
    expect(xa?.primaryEmpId).toBe("b"); // เวรยังเป็นของ b (rotation ไม่เลื่อน)
    expect(xa?.actualEmpId).not.toBe("b"); // แต่วันนี้คนอื่นทำแทน
    expect(xa?.actualEmpId).toBeTruthy(); // ห้ามปล่อยว่าง
    expect(xa?.reason).not.toBe("rotation"); // ต้องบอกว่าเป็นการแทน
    expect(xa?.primaryPulledToDuty).toBe(true); // แทนเพราะติดงาน ไม่ใช่เพราะลา
  });

  it("คนหลักติดผูกขาด + ไม่มีใครแทนได้เลย → ให้เขาทำซ้อนเอง (ห้ามหน้าที่ว่าง)", () => {
    // เหลือ a กับ b · a ลา → b ทำ ONLINE · "x" ไม่มีใครเหลือนอกจาก b
    const online = duty({
      id: "online",
      name: "ONLINE",
      exclusive: true,
      rotationStartEmpId: "a",
    });
    const x = duty({ id: "x", name: "x", rotationStartEmpId: "b" });
    const result = computeAllDutiesForDay(
      [online, x],
      MON,
      [emp("a"), emp("b")],
      [leave("a", MON)],
      null,
    );
    const xa = result.find((r) => r.dutyId === "x");
    expect(xa?.actualEmpId).toBe("b");
    expect(xa?.reason).not.toBe("all_on_leave");
  });

  it("คนหลักหน้าที่ผูกขาด ไม่ถูกจัดหน้าที่อื่นในวันเดียวกัน", () => {
    const online = duty({ id: "online", name: "ONLINE", exclusive: true });
    const others = ["x", "y", "z"].map((id) => duty({ id, name: id }));
    const result = computeAllDutiesForDay(
      [online, ...others],
      MON,
      staff,
      [],
      null,
    );
    const worker = result.find((r) => r.dutyId === "online")?.actualEmpId;
    expect(worker).toBeTruthy();
    for (const other of result.filter((r) => r.dutyId !== "online")) {
      expect(other.actualEmpId).not.toBe(worker);
    }
  });

  it("หน้าที่ผูกขาด 2 ตัว ต้องได้คนละคน", () => {
    const result = computeAllDutiesForDay(
      [
        duty({ id: "online", name: "ONLINE", exclusive: true }),
        duty({ id: "acct", name: "บัญชี", exclusive: true }),
        duty({ id: "x", name: "x" }),
      ],
      MON,
      staff,
      [],
      null,
    );
    const online = result.find((r) => r.dutyId === "online")?.actualEmpId;
    const acct = result.find((r) => r.dutyId === "acct")?.actualEmpId;
    const other = result.find((r) => r.dutyId === "x")?.actualEmpId;
    expect(online).toBeTruthy();
    expect(acct).toBeTruthy();
    expect(acct).not.toBe(online);
    expect(other).not.toBe(online);
    expect(other).not.toBe(acct);
  });

  it("ไม่มี exclusive → พฤติกรรมเดิมทุกอย่าง (ไม่ regress)", () => {
    const duties = ["x", "y", "z"].map((id) => duty({ id, name: id }));
    const before = computeAllDutiesForDay(duties, MON, staff, [], null);
    const after = computeAllDutiesForDay(
      duties.map((d) => ({ ...d, exclusive: false })),
      MON,
      staff,
      [],
      null,
    );
    expect(after).toEqual(before);
  });

  it("คนเหลือไม่พอ → ยอมดึงคนผูกขาดมาทำซ้อน ดีกว่าปล่อยหน้าที่ว่าง", () => {
    const only2 = [emp("a"), emp("b")];
    const result = computeAllDutiesForDay(
      [
        duty({ id: "online", name: "ONLINE", exclusive: true }),
        duty({ id: "x", name: "x" }),
        duty({ id: "y", name: "y" }),
      ],
      MON,
      only2,
      [],
      null,
    );
    // 3 หน้าที่ / 2 คน → ต้องมีคนทำครบทุกหน้าที่ (ไม่มีช่องว่าง)
    for (const a of result) expect(a.actualEmpId).toBeTruthy();
  });

  it("เหลือคนเดียว → คนนั้นทำหน้าที่ที่เหลือทั้งหมด (ผูกขาดยังอยู่ครบ)", () => {
    const three = ["a", "b", "c"].map((id) => emp(id));
    const result = computeAllDutiesForDay(
      [
        duty({
          id: "online",
          name: "ONLINE",
          period: "monthly",
          exclusive: true,
        }),
        duty({ id: "acct", name: "บัญชี", period: "monthly", exclusive: true }),
        ...["w1", "w2", "w3", "w4", "w5"].map((id) => duty({ id, name: id })),
      ],
      MON,
      three,
      [],
      null,
    );
    const perPerson = new Map<string, number>();
    for (const a of result) {
      expect(a.actualEmpId).toBeTruthy();
      const id = a.actualEmpId as string;
      perPerson.set(id, (perPerson.get(id) ?? 0) + 1);
    }
    // 2 คนติดหน้าที่ผูกขาดคนละ 1 · คนที่เหลือรับ 5 หน้าที่ที่เหลือทั้งหมด
    expect([...perPerson.values()].sort((x, y) => x - y)).toEqual([1, 1, 5]);
  });

  it("ต้องทำซ้อน → กระจายให้คนที่ถืองานน้อยสุด ไม่เทกองที่คนเดียว", () => {
    const three = ["a", "b", "c"].map((id) => emp(id));
    const result = computeAllDutiesForDay(
      [
        duty({
          id: "online",
          name: "ONLINE",
          period: "monthly",
          exclusive: true,
        }),
        duty({ id: "acct", name: "บัญชี", period: "monthly", exclusive: true }),
        ...["w1", "w2", "w3", "w4", "w5"].map((id) => duty({ id, name: id })),
      ],
      MON,
      three,
      // คนที่ควรรับ 5 หน้าที่ลา → เหลือ 2 คนต้องหาร 7 หน้าที่
      [leave("c", MON)],
      null,
    );
    const perPerson = new Map<string, number>();
    for (const a of result) {
      expect(a.actualEmpId).toBeTruthy();
      const id = a.actualEmpId as string;
      perPerson.set(id, (perPerson.get(id) ?? 0) + 1);
    }
    const counts = [...perPerson.values()];
    // 7 หน้าที่ / 2 คน → ต้องเป็น 4-3 ไม่ใช่ 6-1
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it("คนพอ → ยังเลี่ยงคนผูกขาดตามปกติ (fallback ไม่ทำงานพร่ำเพรื่อ)", () => {
    const result = computeAllDutiesForDay(
      [
        duty({ id: "online", name: "ONLINE", exclusive: true }),
        duty({ id: "x", name: "x" }),
      ],
      MON,
      staff,
      [],
      null,
    );
    const worker = result.find((r) => r.dutyId === "online")?.actualEmpId;
    expect(result.find((r) => r.dutyId === "x")?.actualEmpId).not.toBe(worker);
  });
});

/* ─── ความยุติธรรมระยะยาวของหน้าที่ผูกขาด ─────────────────────────────
   กันอนาคต: การบล็อกคนทำหน้าที่ผูกขาดต้องไม่ทำให้ภาระงานเทไปกองที่ใคร
   คนใดคนหนึ่ง · จำลองทั้งปีแล้ววัดจริง แทนการเดาจากโค้ด

   เหตุผลที่ยังยุติธรรมอยู่: `assignPrimaries` ใช้ `assigned` set ร่วมกัน →
   1 คนเป็น "คนหลัก" ได้แค่หน้าที่เดียว การหมุนเวียนคนหลักจึงคำนวณจาก pool
   เต็มเสมอ ไม่ถูก blockedEmpIds รบกวน · blockedEmpIds มีผลเฉพาะชั้น
   "ใครทำจริงวันนี้" (Phase 3)                                            */
describe("หน้าที่ผูกขาด — ความยุติธรรมระยะยาว (จำลอง 1 ปี)", () => {
  const STAFF = ["a", "b", "c", "d", "e", "f"];
  const staff = STAFF.map((id) => emp(id));
  const EXCLUSIVE_IDS = ["online", "acct"];

  // 7 หน้าที่ / 6 คน — หน้าที่มากกว่าคน (เคสจริงของร้าน) → ต้องมีคนทำซ้อน
  // rotationStartDate ต้องเป็นวันแรกที่จำลอง — ถ้า anchor อยู่หลังช่วงจำลอง
  // getPeriodIndex จะติดลบแล้วถูก clamp เป็น 0 → คนหลักไม่หมุนเลย (วัดเพี้ยน)
  const START = "2026-01-01";
  const makeDuties = (exclusive: boolean): Duty[] => [
    duty({
      id: "online",
      name: "ONLINE",
      period: "monthly",
      rotationStartDate: START,
      exclusive,
    }),
    duty({
      id: "acct",
      name: "บัญชี",
      period: "monthly",
      rotationStartDate: START,
      exclusive,
    }),
    ...["gift", "stock", "power", "chip", "door"].map((id) =>
      duty({ id, name: id, rotationStartDate: START }),
    ),
  ];

  const YEAR: string[] = (() => {
    const out: string[] = [];
    const d = new Date(`${START}T00:00:00`);
    for (let i = 0; i < 365; i++) {
      out.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      );
      d.setDate(d.getDate() + 1);
    }
    return out;
  })();

  // ลาแบบ deterministic (~2 วัน/เดือน/คน) — กันเทสต์ flaky
  const LEAVES: LeaveEntry[] = YEAR.flatMap((ymd, i) =>
    i % 3 === 0 ? [leave(STAFF[(i * 7 + Math.floor(i / 5)) % 6], ymd)] : [],
  );

  function simulate(exclusive: boolean) {
    const duties = makeDuties(exclusive);
    const load = new Map<string, number>(STAFF.map((s) => [s, 0]));
    let violations = 0; // คนทำหน้าที่ผูกขาด ถูกจัดหน้าที่อื่นซ้อน
    let unassigned = 0;

    for (const ymd of YEAR) {
      const result = computeAllDutiesForDay(duties, ymd, staff, LEAVES, null);
      const exclusiveWorkers = new Set(
        result
          .filter((a) => EXCLUSIVE_IDS.includes(a.dutyId) && a.actualEmpId)
          .map((a) => a.actualEmpId as string),
      );
      for (const a of result) {
        if (!a.actualEmpId) {
          unassigned++;
          continue;
        }
        load.set(a.actualEmpId, (load.get(a.actualEmpId) ?? 0) + 1);
        if (
          !EXCLUSIVE_IDS.includes(a.dutyId) &&
          exclusiveWorkers.has(a.actualEmpId)
        ) {
          violations++;
        }
      }
    }
    const values = [...load.values()];
    const min = Math.min(...values);
    const max = Math.max(...values);
    return { violations, unassigned, spreadPct: ((max - min) / max) * 100 };
  }

  it("ติ๊กผูกขาด → คนทำ ONLINE/บัญชี ไม่โดนงานซ้อนเลยทั้งปี", () => {
    const before = simulate(false);
    const after = simulate(true);
    // ก่อนแก้ ปัญหานี้เกิดจริงหลายสิบครั้ง/ปี (ยืนยันว่าโจทย์ reproduce ได้)
    expect(before.violations).toBeGreaterThan(0);
    expect(after.violations).toBe(0);
  });

  it("ภาระงานไม่เทไปกองที่ใครคนเดียว — และไม่แย่ลงกว่าเดิม", () => {
    const before = simulate(false);
    const after = simulate(true);
    // ช่องว่างระหว่างคนทำมากสุด-น้อยสุด ต้องไม่บานกว่าเดิม (+2% กัน noise)
    expect(after.spreadPct).toBeLessThanOrEqual(before.spreadPct + 2);
    // และต้องอยู่ในเกณฑ์ยอมรับได้ในเชิงสัมบูรณ์
    expect(after.spreadPct).toBeLessThan(15);
  });

  it("คนพอ (6 คน / 7 หน้าที่) → ไม่มีหน้าที่ไหนว่างทั้งปี", () => {
    expect(simulate(true).unassigned).toBe(0);
  });

  it("คนน้อยมาก + มีคนลา → ก็ยังไม่มีหน้าที่ว่าง (ทั้งติ๊กและไม่ติ๊ก)", () => {
    // ปิดช่องโหว่เดิมด้วย: monthly lock เคยทำให้หน้าที่รายสัปดาห์ว่าง
    // ตอนเหลือคนเดียวแล้วคนนั้นลา — 175 ช่อง/ปี ทั้งที่ยังไม่ได้ติ๊กผูกขาด
    const skeleton = STAFF.slice(0, 3).map((id) => emp(id));
    for (const exclusive of [false, true]) {
      const duties = makeDuties(exclusive);
      let unassigned = 0;
      for (const ymd of YEAR) {
        for (const a of computeAllDutiesForDay(
          duties,
          ymd,
          skeleton,
          LEAVES,
          null,
        )) {
          if (!a.actualEmpId) unassigned++;
        }
      }
      expect(unassigned).toBe(0);
    }
  });

  it("คนน้อยมาก (3 คน / 7 หน้าที่) → ก็ยังไม่มีหน้าที่ว่าง", () => {
    // fallback ต้องทำงาน: ยอมให้คนผูกขาดทำซ้อน ดีกว่าปล่อยหน้าที่ว่าง
    const skeleton = STAFF.slice(0, 3);
    const skeletonStaff = skeleton.map((id) => emp(id));
    const duties = makeDuties(true);
    let unassigned = 0;
    for (const ymd of YEAR) {
      for (const a of computeAllDutiesForDay(
        duties,
        ymd,
        skeletonStaff,
        // ไม่มีใครลา — ทดสอบเฉพาะเคส "คนน้อยกว่าหน้าที่"
        [],
        null,
      )) {
        if (!a.actualEmpId) unassigned++;
      }
    }
    expect(unassigned).toBe(0);
  });
});
