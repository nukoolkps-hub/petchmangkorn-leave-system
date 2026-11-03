/* ─── check-duty-sync — กัน rotation algorithm client/server diverge ─────
   อัลกอริทึมเลือก primary ถูก copy ไว้ 2 ที่ (src/ กับ functions/ — แชร์
   package กันไม่ได้เพราะ build แยก) ถ้าแก้ฝั่งเดียว forecast ฝั่ง admin
   จะไม่ตรงกับ snapshot จริงแบบเงียบๆ

   สคริปต์นี้ดึง function body ของฟังก์ชันแกน (hashDutyId, pickPrimary,
   assignPrimaries) จากทั้ง 2 ไฟล์ → ตัด comment + normalize whitespace →
   เทียบกัน · ต่างกัน = exit 1 (fail CI)

   รัน: node scripts/check-duty-sync.mjs

   ⚠️ ขอบเขต: ตรวจเฉพาะ "atomic helpers" ใน FUNCTIONS_TO_CHECK เท่านั้น
   ไม่ตรวจ orchestration (computeAllDutiesForDay) เพราะออกแบบให้ต่างกัน
   โดยตั้งใจ — server: coverage cascade + write-back cache ·
   client: rotation only (forecast ไม่เรียก coverage) · ถ้าเพิ่ม caller ใหม่ที่
   ใช้ computeAllDutiesForDay ฝั่ง client ต้องระวัง — อาจได้ผลต่างจาก
   server snapshot ตาม semantic ที่ document ไว้ในแต่ละไฟล์                */

import { readFileSync } from "node:fs";

const CLIENT = "src/utils/dutyUtils.ts";
const SERVER = "functions/src/duty/dutyUtils.ts";
const FUNCTIONS_TO_CHECK = [
  "hashDutyId",
  "pickPrimary",
  "assignPrimaries",
  "isSunday",
  "applicableDuties",
  "monthlyPrimariesForDay",
  "pickCoverageCandidate",
  "pickRotationSubstitute",
  "replayRotationSubHistory",
  "resolveDutyPool",
  "sortByDisplayOrder",
];

/** ดึง body ของ function NAME(...) {...} ด้วยการนับวงเล็บปีกกา */
function extractFunction(source, name) {
  // รองรับ generic (`function name<T ...>(`) ด้วย
  const re = new RegExp(`function ${name}\\s*(?:<[^(]*>)?\\s*\\(`);
  const m = re.exec(source);
  if (!m) return null;
  const start = m.index;
  const open = source.indexOf("{", start);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

/** ตัด comment (// และ /* *​/) + type annotations เชิงผิว + normalize
 *  whitespace — เทียบเฉพาะ logic ไม่เทียบ format/คำอธิบาย */
function normalize(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const clientSrc = readFileSync(CLIENT, "utf-8");
const serverSrc = readFileSync(SERVER, "utf-8");

let failed = false;
for (const name of FUNCTIONS_TO_CHECK) {
  const c = extractFunction(clientSrc, name);
  const s = extractFunction(serverSrc, name);
  if (!c || !s) {
    console.error(
      `❌ ${name}: not found in ${!c ? CLIENT : SERVER} — ` +
        `ฟังก์ชันแกนหาย/เปลี่ยนชื่อ (อัปเดต FUNCTIONS_TO_CHECK ด้วยถ้าตั้งใจ)`,
    );
    failed = true;
    continue;
  }
  if (normalize(c) !== normalize(s)) {
    console.error(
      `❌ ${name}: client/server DIVERGED — แก้ให้ตรงกันทั้ง ${CLIENT} ` +
        `และ ${SERVER} (forecast ฝั่ง admin จะไม่ตรง snapshot ถ้าปล่อยไว้)`,
    );
    failed = true;
  } else {
    console.log(`✓ ${name} in sync`);
  }
}

process.exit(failed ? 1 : 0);
