/* ─── หน้าที่ "แทนคนลา" (coverage) — ผูกขาดคนทำอัตโนมัติ ─────────────
   coverage คำนวณฝั่ง server เท่านั้น (functions/src/duty/dutyUtils.ts) —
   client engine (src/utils/dutyUtils.ts) รู้จักแค่หน้าที่หมุนเวียน จึงเทสต์
   ที่ตัว server engine ตรงๆ (ไฟล์นั้น pure TS ไม่มี dependency กับ firebase)

   กฎที่เทสต์นี้ยึด (เรียงตามลำดับความสำคัญ เหมือนหน้าที่ผูกขาด):
   1. ห้ามมีหน้าที่ว่าง ถ้ายังมีคนมาทำงาน
   2. คนที่ถูกดึงไปแทน → ไม่ถูกจัดหน้าที่อื่น (ผูกขาด · ไม่มี toggle เพราะ
      เปิดอยู่เสมอโดยธรรมชาติของหน้าที่ประเภทนี้)
   3. ถ้าจำเป็นต้องทำซ้อน → กระจายให้คนที่ถือหน้าที่วันนี้น้อยสุด            */

import { describe, expect, it } from "vitest";
import {
  computeAllDutiesForDay,
  type Duty,
  type Employee,
  type LeaveEntry,
} from "../../functions/src/duty/dutyUtils";

// จันทร์ — ร้านเปิด (ไม่ใช่เสาร์/อาทิตย์)
const MON = "2026-06-01";

function emp(id: string, order: number): Employee {
  return {
    id,
    name: id,
    avatar: id,
    avatarType: "text",
    avatarImageUrl: null,
    displayOrder: order,
  };
}

/** พนักงานขาย 3 คน (a·b·c) + พนักงานบัญชี (acct1·acct2)
 *  (ต้นทางแยกด้วยตำแหน่ง · ที่นี่แยกด้วย memberEmpIds / coverageTargetEmpIds) */
const SALES = ["a", "b", "c"];
const ACCT = ["acct1", "acct2"];
const STAFF: Employee[] = [
  emp("a", 1),
  emp("b", 2),
  emp("c", 3),
  emp("acct1", 4),
  emp("acct2", 5),
];

function rotation(id: string, extra: Partial<Duty> = {}): Duty {
  return {
    id,
    name: id,
    kind: "rotation",
    period: "weekly",
    memberEmpIds: SALES,
    rotationStartDate: "2026-01-01",
    ...extra,
  };
}

function coverage(extra: Partial<Duty> = {}): Duty {
  return {
    id: "cov",
    name: "แทนบัญชี",
    kind: "coverage",
    period: "weekly",
    coverageTargetEmpIds: ACCT,
    candidateEmpIds: ["a", "b", "c"],
    rotationStartDate: "2026-01-01",
    ...extra,
  };
}

const leave = (id: string): LeaveEntry => ({
  employeeId: id,
  start: MON,
  end: MON,
});

describe("หน้าที่แทนคนลา (coverage) — ผูกขาดคนทำ", () => {
  it("คนที่ถูกดึงไปแทน ไม่ถูกจัดหน้าที่หมุนเวียนอื่นในวันเดียวกัน", () => {
    const duties = [coverage(), rotation("d1"), rotation("d2"), rotation("d3")];
    const res = computeAllDutiesForDay(duties, MON, STAFF, [
      leave("acct1"),
      leave("acct2"),
    ]);
    const subs = res
      .filter((a) => a.dutyId === "cov")
      .map((a) => a.actualEmpId)
      .filter((id): id is string => !!id);
    expect(subs.length).toBe(2); // acct ลา 2 คน → ดึงคนแทน 2 คน
    for (const a of res.filter((x) => x.dutyId !== "cov")) {
      expect(subs).not.toContain(a.actualEmpId);
    }
  });

  it("ทุกคนที่มาทำงานถูกดึงไปแทนหมด → หน้าที่หมุนเวียนต้องไม่ว่าง", () => {
    // b·c ลา → เหลือ a คนเดียว แล้ว a ถูกดึงไปแทนบัญชี
    const duties = [coverage(), rotation("d1"), rotation("d2")];
    const res = computeAllDutiesForDay(duties, MON, STAFF, [
      leave("acct1"),
      leave("b"),
      leave("c"),
    ]);
    expect(res.find((a) => a.dutyId === "cov")?.actualEmpId).toBe("a");
    // กฎ "ห้ามมีหน้าที่ว่าง" ชนะกฎผูกขาด — a ทำทั้งหมด
    for (const a of res.filter((x) => x.dutyId !== "cov")) {
      expect(a.actualEmpId).toBe("a");
      expect(a.reason).toBe("double_up");
    }
  });

  it("ต้องทำซ้อนหลายคน → กระจายให้คนที่ถือหน้าที่น้อยสุด (ไม่กองที่คนเดียว)", () => {
    // acct ลา 2 คน → a·b ถูกดึงไปแทน · c ลา → เหลือ a·b รับ 4 หน้าที่
    const duties = [
      coverage(),
      rotation("d1"),
      rotation("d2"),
      rotation("d3"),
      rotation("d4"),
    ];
    const res = computeAllDutiesForDay(duties, MON, STAFF, [
      leave("acct1"),
      leave("acct2"),
      leave("c"),
    ]);
    const load = new Map<string, number>();
    for (const a of res) {
      if (a.actualEmpId)
        load.set(a.actualEmpId, (load.get(a.actualEmpId) ?? 0) + 1);
    }
    // ไม่มีหน้าที่ว่าง
    expect(res.every((a) => !!a.actualEmpId)).toBe(true);
    // 6 assignment (coverage 2 + rotation 4) กระจาย a·b คนละ 3
    expect(load.get("a")).toBe(3);
    expect(load.get("b")).toBe(3);
  });

  it('เคารพ "ไม่ให้เป็นคนแทน" แม้ในทางเลือกสุดท้าย', () => {
    // เหลือ a คนเดียว + ถูกดึงไปแทนบัญชี · d1 ห้าม a เป็นคนแทน → ยอมว่าง
    const duties = [
      coverage(),
      rotation("d1", { substituteExcludedEmpIds: ["a"] }),
      rotation("d2"),
    ];
    const res = computeAllDutiesForDay(duties, MON, STAFF, [
      leave("acct1"),
      leave("b"),
      leave("c"),
    ]);
    expect(res.find((a) => a.dutyId === "d1")?.actualEmpId).toBeNull();
    expect(res.find((a) => a.dutyId === "d2")?.actualEmpId).toBe("a");
  });

  it("คนหลักถูกดึงไปแทนบัญชี → หน้าที่เดิมขึ้น 'แทน X (ติดหน้าที่อื่น)' ไม่ใช่ '(ลา)'", () => {
    // a ถูกดึงไปแทนบัญชี · a เป็นคนหลักของ d1 → d1 ต้องคง a เป็นคนหลัก
    // แล้วให้คนอื่นทำแทน · และต้องบอกว่า "ติดหน้าที่อื่น" ไม่ใช่ "ลา"
    const duties = [
      coverage({ candidateEmpIds: ["a"] }),
      rotation("d1", { rotationStartEmpId: "a" }),
    ];
    const res = computeAllDutiesForDay(duties, MON, STAFF, [leave("acct1")]);
    expect(res.find((x) => x.dutyId === "cov")?.actualEmpId).toBe("a");
    const d1 = res.find((x) => x.dutyId === "d1");
    expect(d1?.primaryEmpId).toBe("a"); // เวรยังเป็นของ a
    expect(d1?.actualEmpId).not.toBe("a"); // แต่วันนี้คนอื่นทำแทน
    expect(d1?.actualEmpId).toBeTruthy();
    expect(d1?.primaryPulledToDuty).toBe(true); // ไม่ใช่ "ลา"
  });

  it("คนหลักลาจริง → ยังเป็น '(ลา)' เหมือนเดิม (ไม่ติดป้ายผิด)", () => {
    const duties = [coverage(), rotation("d1", { rotationStartEmpId: "a" })];
    const res = computeAllDutiesForDay(duties, MON, STAFF, [leave("a")]);
    const d1 = res.find((x) => x.dutyId === "d1");
    expect(d1?.primaryEmpId).toBe("a");
    expect(d1?.actualEmpId).not.toBe("a");
    expect(d1?.primaryPulledToDuty).toBeFalsy();
  });

  it("คนหลักถูกดึงไป ONLINE (ผูกขาด รายเดือน) → หน้าที่เดิมขึ้น 'แทน X'", () => {
    // เคสจริงที่เจอหน้างาน: ONLINE (monthly · ผูกขาด) ดึง b ไปแทนคนลา
    // → หน้าที่รายสัปดาห์ที่ b เป็นคนหลัก ต้องไม่ย้ายเวรให้คนแทนเงียบๆ
    const duties: Duty[] = [
      {
        id: "online",
        name: "ONLINE",
        kind: "rotation",
        period: "monthly",
        memberEmpIds: ["a", "b"], // c ทำ ONLINE ไม่ได้ → เหลือ b มาแทน a
        rotationStartDate: MON,
        rotationStartEmpId: "a",
        exclusive: true,
      },
      rotation("d1", { rotationStartEmpId: "b", rotationStartDate: MON }),
    ];
    const res = computeAllDutiesForDay(duties, MON, STAFF, [leave("a")]);
    expect(res.find((x) => x.dutyId === "online")?.actualEmpId).toBe("b");
    const d1 = res.find((x) => x.dutyId === "d1");
    expect(d1?.primaryEmpId).toBe("b"); // เวรยังเป็นของ b (rotation ไม่เลื่อน)
    expect(d1?.actualEmpId).toBe("c"); // c มาทำแทน
    expect(d1?.reason).not.toBe("rotation");
    expect(d1?.primaryPulledToDuty).toBe(true);
  });

  it("ไม่มีใครถูกดึงไปแทน → ผลลัพธ์เหมือนเดิมทุกประการ", () => {
    const duties = [coverage(), rotation("d1"), rotation("d2")];
    const withCoverage = computeAllDutiesForDay(duties, MON, STAFF, []);
    const withoutCoverage = computeAllDutiesForDay(
      [rotation("d1"), rotation("d2")],
      MON,
      STAFF,
      [],
    );
    expect(withCoverage.filter((a) => a.dutyId !== "cov")).toEqual(
      withoutCoverage,
    );
  });
});
