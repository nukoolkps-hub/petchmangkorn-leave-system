/* ─── snapshot ของหน้าที่ ต้องพา field ครบจาก engine ────────────────
   `recompute.ts` ประกอบ `AssignmentItem` เองทีละ field (ไม่ได้ spread
   assignment ทั้งก้อน เพราะต้อง denorm ชื่อ + แนบ pool) → เพิ่ม field ใหม่
   ใน `DutyAssignment` แล้วลืมแมป = ข้อมูลหายเงียบๆ ระหว่างทางลง Firestore
   ไม่มี error ไม่มีเทสต์แดง UI แค่ "ไม่เปลี่ยน" (เจอมาแล้วกับ
   `primaryPulledToDuty` — PR #783 แก้ engine ครบแต่คำใน UI ยังเป็นของเดิม)

   เทสต์นี้อ่าน source ตรงๆ แล้วเทียบชื่อ field — ไม่ได้เช็ค logic แค่กัน
   "ลืมแมป" ซึ่งเป็นความผิดพลาดที่มองไม่เห็นจากการรันโปรแกรม               */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ENGINE = "functions/src/duty/dutyUtils.ts";
const WRITER = "functions/src/duty/recompute.ts";

/** ชื่อ field ของ interface NAME { ... } (ระดับบนสุด · ข้าม comment) */
function interfaceFields(source: string, name: string): string[] {
  const start = source.indexOf(`interface ${name} {`);
  if (start === -1) throw new Error(`ไม่เจอ interface ${name}`);
  const open = source.indexOf("{", start);
  let depth = 0;
  let end = -1;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = source
    .slice(open + 1, end)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  return [...body.matchAll(/^\s*(\w+)\??\s*:/gm)].map((m) => m[1]);
}

describe("snapshot หน้าที่ — field ไม่หายระหว่างทาง", () => {
  it("ทุก field ของ DutyAssignment ถูกแมปลง snapshot", () => {
    const engine = readFileSync(ENGINE, "utf8");
    const writer = readFileSync(WRITER, "utf8");
    const fields = interfaceFields(engine, "DutyAssignment");
    expect(fields).toContain("primaryPulledToDuty"); // sanity: อ่าน source ติด

    const missing = fields.filter((f) => !writer.includes(f));
    expect(missing, `field ที่ engine คืนมาแต่ ${WRITER} ไม่ได้แมป`).toEqual([]);
  });
});
