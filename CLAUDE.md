# Petchmangkorn Leave System

ห้างทองเพชรมังกร — ระบบการลาพนักงาน + โหมด ADMIN

> **ขอบเขต:** ระบบนี้ทำ **เฉพาะการลา** เท่านั้น · แยกมาจากระบบพนักงานของ
> ห้างเพชรทองมุกดา โดยตัดเงินเดือน/ค่าคอมกองกลาง/เบิกเงิน/เงินกู้/หน้าที่ประจำ/
> ความรู้ต่างๆ/ราคาทอง/PDF สลิป-ใบรับรอง/backup/ล้างข้อมูล ออกทั้งหมด
> **อย่าเพิ่มฟีเจอร์เรื่องเงินกลับเข้ามาโดยไม่ได้รับคำสั่ง**
>
> ข้อยกเว้นเดียวที่เกี่ยวกับเงิน: **ค่าหักวันลา** (ดู Business Rules) —
> เป็นแค่ตัวเลขให้เห็น ไม่มีการจ่าย/ตัดยอดจริง

## Tech Stack

- **Frontend:** React 19 + TypeScript + Vite 8 + Tailwind CSS 4
- **Backend:** Firebase Cloud Functions (Node.js 22, TypeScript)
- **Database:** Firestore (named database: `petchmangkorn-bot`)
- **Auth:** Firebase Auth (LINE Login + Dev mode)
- **Storage:** Firebase Storage (เฉพาะรูปโปรไฟล์)
- **Linting:** Biome
- **Icons:** `lucide-react` (อันเดียวทั้งระบบ) · **ห้ามใช้ emoji เป็น icon ใน UI** ·
  ยกเว้น content ที่ความหมายเป็น emoji จริงๆ (avatar emoji picker)
- **Dropdown:** **ห้ามใช้ native `<select>`** — ใช้ `ThemedSelect` เสมอ ·
  ตัวเลือกเดือนใช้ `MonthChevronNav` / `ThaiMonthPicker`
- **Routing:** react-router-dom v7 (HashRouter)

## Commands

```bash
npm run dev          # Frontend + Firebase Emulators
npm run build        # Production build → dist/
npm run typecheck    # tsc --noEmit
npm run check        # Biome lint + format
npm test             # Vitest (รันครั้งเดียว)
npm run test:watch   # Vitest watch mode
```

Deploy เกิดอัตโนมัติเมื่อ push เข้า `main` (`.github/workflows/deploy.yml`) —
ไม่ต้องรัน `firebase deploy` ด้วยมือ

**Testing:** Vitest · test ไฟล์อยู่ข้าง source (`*.test.ts`) · โฟกัส pure logic
ใน `src/utils/` (นับวันลา · โควต้า · ปฏิทินร้าน · format · วันที่) ·
CI job `test` (typecheck + `npm test`) gate ทุก deploy job — เทสต์ fail = ไม่ deploy

## Architecture

```
main.tsx → AuthProvider → AuthGate → App.tsx (LeaveApp)
                                       ├── /home    → HomeTab (โควต้า + ปฏิทินทีม)
                                       ├── /request → RequestTab (ฟอร์มยื่นลา)
                                       └── /admin   → AdminPanel (admin-only)
```

### AdminPanel — section components

`AdminPanel.tsx` เป็น **router บางๆ** — render section ตาม `section` prop
แต่ละ section แยกเป็น component ของตัวเอง (state เป็น local ของแต่ละตัว)

| section | component |
|---|---|
| calendar-view | `TeamCalendar` (ใช้ร่วมกับหน้าแรกของพนักงาน) |
| store-calendar | `StoreCalendarPanel` |
| summary | `LeaveSummaryPanel` |
| leaves | `LeaveListPanel` |
| roles (พนักงาน) | `EmployeeAdminPanel` → `EmployeeEditModal` |
| linebot-notifications | `LineBotNotificationsPanel` |
| linebot-commands | `LineBotCommandsPanel` |

**กฎ:** component ไม่ควรเกิน ~300-400 บรรทัด — ถ้าโตเกินให้แยก

`adminMonth` (เดือนที่กำลังดู) ถูก lift ไว้ที่ `AdminPanel` แล้วส่งเป็น props
ให้ "สรุปลา" กับ "เพิ่ม-ลบการลา" ใช้ร่วมกัน — เลือกเดือนที่หนึ่ง อีกหน้าตามด้วย

### Data Flow

```
useAppData() → useFirebaseAppData() → Firestore real-time (onSnapshot)
                                       ├── employees      (admin: ทุกคน · employee: เฉพาะตัวเอง)
                                       ├── leaves         (ทุกคน signed-in — ปฏิทินทีม + กันลาทับวัน)
                                       └── storeCalendar  (`/config/storeCalendar`)
```

**Scope ของ subscription:**
- `employees` → employee เห็นเฉพาะของตัวเอง (query by `lineUserId == auth.uid`)
- `leaves` → ทุกคน signed-in อ่านได้ · ใบลาไม่มีฟิลด์อ่อนไหว · leave doc เก็บ
  snapshot `employeeName + employeeNickname` ให้เพื่อนอ่านชื่อได้โดยไม่ต้องเปิด
  `/employees` ทั้งคน · **filter/lookup ใช้ `employeeId` เสมอ ไม่ใช่ชื่อ**
- `updateEmployee` จะ `restampLeaveSnapshot()` ให้อัตโนมัติเมื่อ admin แก้ชื่อ/ชื่อเล่น
  — ไม่งั้นปฏิทินทีมยังโชว์ชื่อเก่า

### Auth Flow

```
กดปุ่ม LINE Login → redirect ไป LINE
  → callback กลับ + code
  → Cloud Function lineAuth แลก code → LINE profile
  → เช็ค ADMIN_LINE_USER_ID → ให้ admin claim (ถ้าตรง)
  → เช็ค employee.lineUserId → สร้าง Firebase custom token
  → signInWithCustomToken → เข้าระบบ
```

## Key Source Files

| Path | Description |
|---|---|
| `src/App.tsx` | Orchestrator — routes, hooks, modals |
| `src/components/admin/AdminPanel.tsx` | Admin router — render section components |
| `src/components/admin/EmployeeAdminPanel.tsx` + `EmployeeEditModal.tsx` | จัดการพนักงาน: list (ลากเรียง) + ฟอร์มแก้ไข |
| `src/components/admin/LeaveSummaryPanel.tsx` / `LeaveListPanel.tsx` | สรุปลา / รายการลา |
| `src/components/admin/PayrollPeriodBar.tsx` | แถบรอบจ่าย + ปุ่มปิด/เปิดรอบ |
| `src/components/admin/PeriodSettlementTable.tsx` | ตารางสรุปเงินทั้งรอบ (ทุกคน) + ปุ่มคัดลอก |
| `src/utils/payrollPeriod.ts` | **Single source** ของขอบเขตรอบจ่าย (มี unit test) |
| `src/utils/periodSettlement.ts` | **Single source** ของสรุปเงินทั้งรอบ + snapshot ล็อกยอด (มี unit test) |
| `src/components/admin/StoreCalendarPanel.tsx` | วันเปิด-ปิดร้าน (cascade ลบใบลาในวันที่ปิด) |
| `src/components/home/TeamCalendar.tsx` | ปฏิทินทีม — ใช้ทั้งหน้าแรกพนักงานและ admin |
| `src/types/index.ts` | Domain types ทั้งหมด |
| `src/constants.ts` | Colors, business rules, validation patterns |
| `src/data/useFirebaseAppData.ts` | Firestore subscriptions + CRUD · `restampLeaveSnapshot()` |
| `src/firebase/hooks/useFirestore.ts` | Subscription hooks per collection (scope: admin vs employee) |
| `src/hooks/useLeaveForm.ts` | ฟอร์มยื่นลา + validation + กันยื่นทับวัน |
| `src/utils/leaveUtils.ts` | นับวันลา, ค่าหัก, โบนัส 2 ก้อน (มี unit test) |
| `src/utils/storeCalendar.ts` | **Single source** ว่าวันไหนร้านเปิด-ปิด (มี unit test) |
| `src/components/shared/calendarTheme.ts` | Single source ของ theme ปฏิทินทั้งระบบ |
| `src/components/shared/ThemedSelect.tsx` | dropdown ใช้แทน native `<select>` ทุกที่ |
| `functions/src/index.ts` | Cloud Functions barrel exports |
| `functions/src/auth/` | LINE Login → Firebase custom token + admin claim |
| `functions/src/line/` | LINE webhook + commands |
| `functions/src/dailySummary/` | สรุปเช้า 07:30 "ใครหยุดวันนี้" |
| `firestore.rules` / `storage.rules` | Security rules |

## Business Rules

| Rule | Value |
|---|---|
| วันสูงสุดต่อใบลา 1 ใบ | 31 วัน |
| ประเภทการลา | ลากิจ (`personal`) · ลาป่วย (`sick`) |
| โควต้าวันลาธรรมดาที่ไม่ถูกหัก | **1 วัน/รอบ** |
| หักวันธรรมดาที่ลาเกินโควต้า | 300 บาท/วัน |
| หักวันอาทิตย์ที่ลา (ร้านเปิด) | 500 บาท/วัน — ไม่ใช้โควต้า |
| โบนัส: ไม่ลาวันธรรมดาเลยทั้งรอบ | +300 บาท |
| Top up: ไม่ลาเลยทั้งรอบ | +700 บาท (รวมเป็น +1,000) |

ค่าทั้งหมดอยู่ใน `src/constants.ts` → `BUSINESS_RULES`
(`MAX_LEAVE_BONUS` = ผลรวมโบนัสสูงสุด ใช้โชว์ใน UI/คู่มือ)

> ⚠️ **โควต้า = ไม่ถูกหักเงินเท่านั้น ไม่ใช่ "ลาฟรี"** — ลาวันธรรมดาแม้อยู่ใน
> โควต้าก็ทำให้ **เสียโบนัสทั้ง 2 ก้อน** ทันที · วันแรกจึงเป็นวันที่แพงที่สุด
> (เสีย 1,000) ไม่ใช่ถูกที่สุด

### ค่าหักวันลา

**ระบบนี้ยังไม่จ่ายเงินเดือน** — ยอดหักเป็น "ตัวเลขให้เห็นตรงกัน" ระหว่าง
พนักงานกับ ADMIN เท่านั้น ไม่มีการตัดยอด/บันทึกธุรกรรมเงินที่ไหน ·
**อย่าเพิ่มเงินเดือน/ค่าคอม/เบิกเงิน/เงินกู้กลับเข้ามาโดยไม่ได้รับคำสั่ง**

| วัน | คิดยังไง |
|---|---|
| จ-ศ (ร้านเปิด) ภายในโควต้า | ฟรี (แต่เสียโบนัส) |
| จ-ศ (ร้านเปิด) เกินโควต้า | × `OVER_QUOTA_WEEKDAY_DEDUCTION` |
| เสาร์เปิดพิเศษ | นับเป็นวันธรรมดา (ใช้โควต้า/หักเหมือนกัน) |
| อาทิตย์ (ร้านเปิด) | × `SUNDAY_LEAVE_DEDUCTION` ทุกวัน ไม่ใช้โควต้า |
| วันร้านปิดทุกกรณี | ไม่นับ ไม่หัก |

**โบนัส 2 ก้อน** — ตัดสินจาก "ทั้งรอบ" ไม่ใช่รายวัน · ก้อนที่ 2 **ทับบน**
ก้อนที่ 1 ไม่ใช่แทนที่:

1. **ไม่ลาวันธรรมดาเลย** → `NO_WEEKDAY_LEAVE_BONUS` ·
   ลาวันอาทิตย์ไม่ทำให้เสียก้อนนี้ · **แต่ลาวันธรรมดาแม้อยู่ในโควต้าก็เสีย**
2. **ไม่ลาเลยทั้งรอบ** (ทั้งธรรมดาและอาทิตย์) → บวก `PERFECT_ATTENDANCE_TOPUP`
   อีกก้อน · ลาวันร้านปิดไม่ทำให้เสียโบนัส

ผลลัพธ์ที่ตามมาจากสูตรนี้ (ไม่ต้องเขียนเป็นกฎแยก):

| ทั้งรอบ | สุทธิ |
|---|---|
| ไม่ลาเลย | **+1,000** |
| ลาอาทิตย์ 1 วัน | −500 +300 = **−200** |
| ลาอาทิตย์ 2 วัน | −1,000 +300 = **−700** |
| ลาวันธรรมดา 1 วัน (ในโควต้า) | ไม่หัก แต่ไม่ได้โบนัส = **0** |
| ลาวันธรรมดา 2 วัน | **−300** |
| ลาวันธรรมดา 1 + อาทิตย์ 1 | **−500** |

**Single source: `src/utils/leaveUtils.ts`** — ห้ามคูณอัตราเองใน component

- `getCountedLeaveDays(leaves, calendar, period)` → `{ weekdays, sundays }`
  จำนวนวันลาที่นับ **ยังไม่หักโควต้า** (dedupe ใบลาที่ทับวันกันแล้ว) ·
  คิดเงินใช้ผ่าน `getLeaveDeduction` · คิดโบนัสใช้ตัวเลขดิบนี้ตรง ๆ ·
  ⚠️ `LeaveDeduction.weekdayDays` = วันที่ **เกินโควต้า** ไม่ใช่วันลาดิบ —
  UI ที่จะโชว์ "ลาไปกี่วัน" ต้องใช้ `getCountedLeaveDays`
- `getLeaveDeduction(leaves, calendar, period)` → ยอดหักของชุดใบลา
  (ใส่ `period` เสมอเมื่อคิดรายรอบ เพื่อ clamp ใบลาคร่อมรอบ)
- `getLeaveBonus(leaves, calendar, period)` → `{ noWeekdayLeave, perfectTopUp,
  total }` โบนัสแยกก้อน — UI ต้องอธิบายว่าได้ก้อนไหน จึงคืนเป็น object
- `hasNoWeekdayLeave` / `hasPerfectAttendance(leaves, calendar, period)` → boolean
- `getMonthlySettlement(leaves, calendar, period)` →
  `{ deduction, bonus, bonusDetail, net }` ยอดสุทธิของรอบ
  (`net > 0` = ได้เงินเพิ่ม · `< 0` = ถูกหัก)
- `getAdditionalDeduction(existing, candidate, calendar)` → ยอดหักที่ใบลา
  **ใบใหม่** จะเพิ่ม คิดเป็นส่วนต่างจากใบเดิม (โควต้าเป็นของทั้งเดือน)
- `getRequestImpact(existing, candidate, calendar)` → `{ deduction, bonusLost,
  total }` ผลกระทบเป็นเงินทั้งหมดของใบใหม่ — **ใช้ตัวนี้ในฟอร์มยื่นลา**
  เพราะใบแรกของเดือนอาจไม่ถูกหักเลยแต่ทำให้เสียโบนัส 1,000
- render ผ่าน `<DeductionSummary />` + `<BonusNote />`
  (`src/components/shared/`) ทุกที่ เพื่อให้ถ้อยคำ/ตัวเลขตรงกัน

แก้อัตราหรือโควต้า → แก้ที่ `BUSINESS_RULES` ที่เดียว แล้วรัน `npm test`
(เทสต์ล็อก "จำนวนวันที่ถูกหัก" ไว้ ไม่ได้ hardcode ตัวเลขบาท)

**UI ที่โชว์ยอดหัก:** การ์ดโควต้าหน้าแรก (`HomeTab`) · ฟอร์มยื่นลา
(`RequestTab` + `SubmitLeaveConfirmModal`) · สรุปลาฝั่ง admin
(`LeaveSummaryPanel` — รายคน + ยอดรวมทั้งเดือน)

**ลาวันอาทิตย์ต้องติ๊กยืนยัน** — `SubmitLeaveConfirmModal` disable ปุ่มส่ง
จนกว่าจะติ๊กรับทราบว่าจะถูกหัก (กันกดผ่านโดยไม่ทันอ่าน)

### รอบจ่ายเงินเดือน (payrollPeriods)

ร้านคิดเงินเดือน **ก่อนสิ้นเดือน** ได้ — วันตัดไม่คงที่ (อยู่ช่วง 25-31)
admin เลือกวันแล้วกด **"ปิดรอบ"** ที่ `/admin → การลา → สรุปลา`

```
รอบ ส.ค. = 28 ก.ค. ──────► 27 ส.ค.   (ปิดรอบวันที่ 27)
รอบ ก.ย. = 28 ส.ค. ──────► 30 ก.ย.   (ยังไม่ปิด = ใช้สิ้นเดือนชั่วคราว)
```

- doc เดียว `/config/payrollPeriods` → `{ cutoffs, snapshots }` มีเฉพาะเดือนที่ปิดแล้ว
  - `cutoffs: { "2026-08": "2026-08-27" }` — วันตัดรอบ
  - `snapshots: { "2026-08": { start, end, closedAt, closedOn, lockedFrom,
    pending, rows, totals } }` — **ยอดที่ล็อกไว้** (`pending: true` = ฉบับร่าง
    ยังไม่ล็อก)
- **วันลาหลังวันตัดยกไปรอบถัดไปอัตโนมัติ** — ไม่ต้องทำอะไรเพิ่ม
- โควต้า/ค่าหัก/โบนัส ผูกกับ **รอบ** ไม่ใช่เดือนปฏิทิน
- เปิดรอบกลับได้ถ้ากดผิดวัน (ปุ่ม "เปิดรอบกลับ")

**Single source: `src/utils/payrollPeriod.ts`**

- `getPeriodRange(yearMonth, cutoffs)` → `{ start, end }` ของรอบนั้น
- `periodKeyForDate(ymd, cutoffs)` → วันนี้ตกรอบไหน (คืน key `YYYY-MM`)
- `periodKeysInRange(start, end, cutoffs)` → ใบลาคร่อมกี่รอบ

ฟังก์ชันใน `leaveUtils` รับ arg สุดท้ายเป็น `PeriodArg` = `"YYYY-MM"`
(เดือนปฏิทินเต็มเดือน) **หรือ** `LeavePeriod` (ช่วงวันของรอบ) — call site
ที่ยังส่งเดือนอยู่จึงไม่พัง

### ล็อกยอดตอนปิดรอบ (snapshot)

รอบที่ **ยังไม่ปิด** คิดยอดสดจากใบลา + ปฏิทินร้านทุกครั้ง ·
กด **"ปิดรอบ"** แล้วยอด **ยังไม่ล็อกทันที** — วันที่กดยังแก้ใบลา/ปฏิทินร้าน
ได้อยู่ ยอดจึงคิดสดต่อไปจนพ้นวันนั้น (เที่ยงคืน) แล้วค่อยล็อก ·
ล็อกแล้วรอบนั้นโชว์ตัวเลขจาก snapshot **ไม่คิดใหม่** แก้ย้อนหลังก็ไม่ขยับ

```
กดปิดรอบ 27 ส.ค.  →  27 ส.ค. ยังแก้ได้ (pending, โชว์ยอดสด)
                   →  28 ส.ค. 00:00 เป็นต้นไป: ล็อกยอดตามสิ้นวันที่ 27
```

**ใครเป็นคนล็อก:** ฝั่ง client (`LeaveSummaryPanel` useEffect →
`finalizePayrollPeriod`) ตอน admin เปิดหน้าสรุปครั้งแรกหลังพ้นเที่ยงคืน ·
ไม่ได้ทำที่ Cloud Function เพราะ `functions/` มี `rootDir: "src"` import
`src/utils/leaveUtils` ข้ามมาไม่ได้ → ต้อง copy สูตรเงินไปอีกชุด ซึ่งจะ drift

ที่ยอมรับได้เพราะหลังพ้นวันตัดแล้ว **สิ่งเดียวที่ทำให้ยอดรอบขยับคือ admin
ไปแก้ย้อนหลัง** ซึ่งต้องเปิดแอปอยู่แล้ว — พอเปิด useEffect จะล็อกให้ก่อน
(พนักงานยื่นใบลาใหม่ได้เฉพาะวันนี้เป็นต้นไป ซึ่งตกรอบถัดไปแล้ว)

**Single source: `src/utils/periodSettlement.ts`** (pure · มี unit test)

- `buildSettlement(employees, leaves, calendar, period)` → `{ rows, totals }`
  ยอดของทุกคนในรอบ (คิดทีละคนแล้วรวม — โควต้า/โบนัสเป็นของแต่ละคน)
- `makeSnapshot(yearMonth, period, settlement, { closedOn, pending })` →
  `PeriodSnapshot` · **ต้องส่ง period ที่ `end` = วันตัดที่เลือก** ไม่ใช่ขอบ
  ชั่วคราวสิ้นเดือนที่โชว์อยู่ตอนรอบยังเปิด · `lockedFrom` = `closedOn` + 1 วัน
- `isSnapshotLocked(snapshot)` → ล็อกแล้วหรือยัง (ยังไม่ล็อก = ต้องโชว์ยอดสด)
- `shouldFinalizeSnapshot(snapshot, todayYmd)` → ถึงเวลาล็อกหรือยัง
- `diffSettlement(snapshot, live)` → คนที่ยอดสด "ตอนนี้" ไม่ตรงกับที่ล็อกไว้
  (มีคนแก้ย้อนหลัง) → UI ขึ้นแถบแดงเตือน + ปุ่ม "ยึดยอดใหม่"

Mutation ทั้งหมด (`closePayrollPeriod` / `finalizePayrollPeriod` /
`reopenPayrollPeriod` / `relockPayrollPeriod` ใน
`src/firebase/payrollPeriods.ts`) ทำผ่าน
`runTransaction` แล้วเขียนทับทั้ง doc — เพราะ `setDoc(merge)` ลบ key ออกจาก
map ไม่ได้ · เก็บย้อนหลังสูงสุด `MAX_SNAPSHOTS` (60) รอบ เกินนั้นตัดรอบเก่าสุดทิ้ง

- **เปิดรอบกลับ** ลบ snapshot ทิ้งด้วย (ยอดที่ล็อกผูกกับวันตัดที่กำลังยกเลิก)
- `finalizePayrollPeriod` เช็ค `pending` ซ้ำใน transaction → หลายเครื่องเปิด
  พร้อมกันก็เขียนครั้งเดียว
- snapshot ที่หน้าตาไม่ครบถูก sanitize ทิ้งทั้งรอบ → ตกกลับไปคิดยอดสด ·
  snapshot รุ่นเก่าที่ไม่มี `closedOn`/`pending` ถือว่าล็อกแล้ว

### ปฏิทินเปิด-ปิดร้าน (storeCalendar)

**ร้านหยุดวันเสาร์เป็นค่าตั้งต้น** · admin override ได้ผ่าน `/config/storeCalendar`:
- `extraOpenSaturdays`: เสาร์ที่ admin เปิดพิเศษ
- `extraClosedWeekdays`: จ-ศ ที่ admin ปิดพิเศษ (อบรม/หยุดยาว)
- `extraClosedSundays`: อาทิตย์ที่ admin ปิดพิเศษ

| วัน | สถานะ default | การลา |
|---|---|---|
| อาทิตย์ | เปิด | นับแยก ไม่กินโควต้าวันธรรมดา |
| อาทิตย์ ∈ `extraClosedSundays` | ปิด | **ไม่นับ** |
| **เสาร์** | **ปิด** | **ไม่นับ** |
| เสาร์ ∈ `extraOpenSaturdays` | เปิด | นับเหมือนวันธรรมดา |
| จ-ศ | เปิด | นับเข้าโควต้า |
| จ-ศ ∈ `extraClosedWeekdays` | ปิด | ไม่นับ |

Single source: `src/utils/storeCalendar.ts` — **แก้ logic วันเปิด-ปิดต้องแก้ที่นี่
ที่เดียว** แล้วอัปเดตเทสต์ใน `storeCalendar.test.ts`

### สรุปเช้า LINE 07:30

`sendDailySummary` (scheduled) push flex "ใครหยุดวันนี้" เข้ากลุ่มที่ admin ตั้งไว้

- **กลุ่มปลายทางไม่ hardcode** — อ่านจาก `config/notifications.dailySummaryTargets`
  (admin ตั้งใน `/admin → LINE BOT → การแจ้งเตือน`) · ว่าง = ไม่ส่ง
- **toggle** `config/notifications.dailySummaryEnabled` (default = เปิด)
- **เสาร์ปกติข้าม** — ส่งเฉพาะเสาร์ที่อยู่ใน `extraOpenSaturdays`
- **Idempotency:** `dailySummarySent/{ymd}` claim ผ่าน transaction — กัน scheduler ยิงซ้ำ
- **Manual test:** พิมพ์ `ทดสอบแจ้งเตือน` ใน LINE 1:1 chat (admin เท่านั้น)

## Conventions

- ภาษาไทยใน UI, ภาษาอังกฤษใน code
- **วันที่ใน UI ต้องเป็นไทยเสมอ** — พ.ศ. (= ค.ศ. + 543) + เดือนไทย ·
  ห้ามใช้ `toLocaleDateString("th-TH", { year: "numeric" })` ตรงๆ (มันคืน ค.ศ.) ·
  ใช้ helper จาก `src/utils/dateUtils.ts` (`fmtDate`, `fmtShort`, `fmtDateWithWeekday`)
  หรือ `THAI_MONTH_NAMES` จาก `src/constants.ts` ·
  data layer (Firestore, state) ใช้ `YYYY-MM-DD` ค.ศ. — แปลงเฉพาะตอน render
- **Color contrast บน maroon bg → `text-white`** (ไม่ใช่ `text-gold-lt`)
- **Typography:** font หลักคือ **Prompt** (set ใน `index.css`) · default inherit
  ทั่วระบบ · button/input/select ที่ browser override ให้ใส่ `font-[inherit]` ·
  identifier ที่ admin พิมพ์ (LINE user/group id) ใช้ `font-[Prompt,monospace]`
- Color theme: Maroon (#7B1C1C) + Gold (#C9973A) + Cream (#FDF8F0)
- Mobile-first layout (max 430px) + Desktop sidebar (>= 768px)
- Named Firestore database: `petchmangkorn-bot` (ไม่ใช่ default) —
  ชื่อนี้ปรากฏใน 4 ที่: `firebase.json` · `src/firebase/config.ts` ·
  `functions/src/helpers/config.ts` · `storage.rules` (ต้องตรงกันทั้งหมด)
- Cloud Functions region: `asia-southeast1`
- Emulator detect จาก hostname (`localhost` / `127.0.0.1`)
- **เมื่อแก้ logic ใน `src/utils/` ต้องเพิ่ม/อัปเดตเทสต์** แล้วรัน
  `npm run typecheck && npm test` ให้ผ่านก่อน push

## Deployment

Auto deploy ผ่าน GitHub Actions เมื่อ push เข้า `main`:
Hosting · Functions · Firestore Rules · Storage Rules

ค่า project id / config อ่านจาก **GitHub Variables + Secrets** (ไม่ hardcode) —
ดูรายการทั้งหมดใน `README.md` → "ขั้นตอนติดตั้ง"

**LINE config:** Firestore `config/secrets` document
(`LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`, `LINE_LOGIN_CHANNEL_ID`,
`LINE_LOGIN_CHANNEL_SECRET`, `ADMIN_LINE_USER_ID`)
