# Petchmangkorn Leave System

ห้างทองเพชรมังกร — ระบบการลาพนักงาน + โหมด ADMIN

> **ขอบเขต:** ระบบนี้ทำ **เฉพาะการลา** เท่านั้น · แยกมาจากระบบพนักงานของ
> ห้างเพชรทองมุกดา โดยตัดเงินเดือน/ค่าคอมกองกลาง/เบิกเงิน/เงินกู้/หน้าที่ประจำ/
> ความรู้ต่างๆ/ราคาทอง/PDF สลิป-ใบรับรอง/backup/ล้างข้อมูล ออกทั้งหมด
> **อย่าเพิ่มฟีเจอร์เรื่องเงินกลับเข้ามาโดยไม่ได้รับคำสั่ง**

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
| `src/components/admin/StoreCalendarPanel.tsx` | วันเปิด-ปิดร้าน (cascade ลบใบลาในวันที่ปิด) |
| `src/components/home/TeamCalendar.tsx` | ปฏิทินทีม — ใช้ทั้งหน้าแรกพนักงานและ admin |
| `src/types/index.ts` | Domain types ทั้งหมด |
| `src/constants.ts` | Colors, business rules, validation patterns |
| `src/data/useFirebaseAppData.ts` | Firestore subscriptions + CRUD · `restampLeaveSnapshot()` |
| `src/firebase/hooks/useFirestore.ts` | Subscription hooks per collection (scope: admin vs employee) |
| `src/hooks/useLeaveForm.ts` | ฟอร์มยื่นลา + validation + กันยื่นทับวัน |
| `src/utils/leaveUtils.ts` | นับวันลา, โควต้า, over-quota (มี unit test) |
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
| โควต้าวันลา/เดือน (วันธรรมดา) | 2 วัน |
| วันสูงสุดต่อใบลา 1 ใบ | 31 วัน |
| ประเภทการลา | ลากิจ (`personal`) · ลาป่วย (`sick`) |

ค่าทั้งหมดอยู่ใน `src/constants.ts` → `BUSINESS_RULES`

**ระบบนี้ไม่คำนวณเงิน** — "เกินโควต้า" เป็นแค่สถานะให้ ADMIN เห็น ไม่มีการหักเงิน

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
