# ระบบการลา — ห้างทองเพชรมังกร

ระบบยื่นใบลาพนักงาน + โหมด ADMIN · React 19 + Firebase · เข้าสู่ระบบด้วย LINE Login

แยกออกมาจากระบบพนักงานของห้างเพชรทองมุกดา โดย **ตัดทุกอย่างที่ไม่เกี่ยวกับการลาออก**
(เงินเดือน · ค่าคอมกองกลาง · เบิกเงินล่วงหน้า · เงินกู้ · หน้าที่ประจำ · ความรู้ต่างๆ ·
ราคาทอง · สลิป/หนังสือรับรอง PDF · backup · ล้างข้อมูล)

---

## ทำอะไรได้บ้าง

**ฝั่งพนักงาน**
- หน้าแรก — โควต้าวันลาเดือนนี้ (2 วัน/เดือน) · สถิติลากิจ/ลาป่วย · ปฏิทินทีม
- ยื่นคำขอลา — เลือกช่วงวัน · กันยื่นทับวันตัวเอง · เห็นว่าวันนั้นเพื่อนลากี่คน
- ลบใบลาของตัวเองได้ถ้ายังไม่ถึงวันลา
- แก้รูปโปรไฟล์ (ตัวอักษร / emoji / อัปโหลดรูป)

**ฝั่ง ADMIN**

| หมวด | หน้า | ทำอะไร |
|---|---|---|
| ปฏิทิน | ปฏิทินการลา | ปฏิทินรวมทั้งทีม + วันเปิด-ปิดร้าน |
| ปฏิทิน | วันเปิด-ปิดร้าน | เปิดเสาร์พิเศษ · ปิด จ-ศ / อาทิตย์ เป็นรายวัน |
| การลา | สรุปลา | สรุปรายเดือนต่อคน + เกินโควต้า |
| การลา | เพิ่ม - ลบ การลา | ยื่นลาแทนพนักงาน · ลบใบลา |
| LINE BOT | การแจ้งเตือน | เปิด-ปิดสรุปเช้า + ตั้งกลุ่ม LINE ปลายทาง |
| LINE BOT | คำสั่ง | รายการคำสั่งที่บอทรองรับ |
| ตั้งค่า | พนักงาน | เพิ่ม/แก้/ลบพนักงาน · ลากเรียงลำดับ |

**LINE Bot**
- สรุปเช้า 07:30 — push "ใครหยุดวันนี้" เข้ากลุ่มที่ตั้งไว้ (ข้ามเสาร์ที่ร้านปิด)
- คำสั่งในแชท: `ไอดีฉัน` · `คำสั่ง` · `ไอดีกลุ่ม` · `@บอท เชื่อมพนักงาน @คน` · `ทดสอบแจ้งเตือน`

---

## กฎการลา

| วัน | สถานะร้าน (ค่าตั้งต้น) | การลา |
|---|---|---|
| จันทร์–ศุกร์ | เปิด | นับเข้าโควต้า **2 วัน/เดือน** |
| เสาร์ | **ปิด** | ไม่นับ |
| เสาร์ ∈ `extraOpenSaturdays` | เปิด | นับเหมือนวันธรรมดา |
| อาทิตย์ | เปิด | นับแยก — ไม่กินโควต้าวันธรรมดา |
| อาทิตย์ ∈ `extraClosedSundays` | ปิด | ไม่นับ |
| จ–ศ ∈ `extraClosedWeekdays` | ปิด | ไม่นับ |

แก้โควต้าได้ที่ `src/constants.ts` → `BUSINESS_RULES.WEEKDAY_LEAVE_QUOTA`

---

## ขั้นตอนติดตั้ง (ทำครั้งเดียว)

### 1. สร้าง Firebase project

1. สร้างโปรเจกต์ใหม่ที่ https://console.firebase.google.com
2. เปิดใช้ **Firestore** — สร้าง database แบบ **Named database** ชื่อ `petchmangkorn-bot`
   (ถ้าใช้ชื่ออื่น ต้องแก้ 4 ที่: `firebase.json` · `src/firebase/config.ts` ·
   `functions/src/helpers/config.ts` · `storage.rules`)
   - Location แนะนำ `asia-southeast1`
3. เปิดใช้ **Storage** (สำหรับรูปโปรไฟล์) และ **Authentication**
4. Authentication → Sign-in method → เปิด **Anonymous** ไว้ (ระบบใช้ custom token)
5. Project settings → Your apps → Add app → **Web** → จดค่า config ไว้ใช้ขั้นตอนที่ 3

### 2. ตั้งค่า LINE

1. สร้าง **LINE Login channel** + **Messaging API channel** ที่ https://developers.line.biz
2. LINE Login → Callback URL: `https://<project-id>.web.app/`
3. Messaging API → Webhook URL: `https://<project-id>.web.app/webhook` → เปิด "Use webhook"
4. ใส่ค่าลง Firestore doc **`config/secrets`** (สร้างเอง collection `config` document `secrets`):

   | field | ค่า |
   |---|---|
   | `LINE_CHANNEL_ACCESS_TOKEN` | Messaging API → Channel access token (long-lived) |
   | `LINE_CHANNEL_SECRET` | Messaging API → Channel secret |
   | `LINE_LOGIN_CHANNEL_ID` | LINE Login → Channel ID |
   | `LINE_LOGIN_CHANNEL_SECRET` | LINE Login → Channel secret |
   | `ADMIN_LINE_USER_ID` | LINE User ID ของเจ้าของร้าน (พิมพ์ `ไอดีฉัน` กับบอทเพื่อดู) |

### 3. ตั้งค่า GitHub repo

Settings → Secrets and variables → Actions

**Secrets**

| ชื่อ | ค่า |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | JSON ของ service account (Firebase → Project settings → Service accounts → Generate new private key) |
| `VITE_FIREBASE_API_KEY` | apiKey จาก web app config |

**Variables**

| ชื่อ | ตัวอย่าง |
|---|---|
| `FIREBASE_PROJECT_ID` | `petchmangkorn-bot` |
| `FIRESTORE_DATABASE_ID` | `petchmangkorn-bot` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `petchmangkorn-bot.firebaseapp.com` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `petchmangkorn-bot.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | เลขจาก web app config |
| `VITE_FIREBASE_APP_ID` | จาก web app config |
| `VITE_FIREBASE_MEASUREMENT_ID` | จาก web app config (ถ้ามี) |
| `VITE_LINE_LOGIN_CHANNEL_ID` | LINE Login Channel ID |

### 4. Deploy

push เข้า `main` → GitHub Actions deploy ให้อัตโนมัติทั้ง 4 อย่าง
(Hosting · Functions · Firestore rules · Storage rules)

### 5. ตั้ง ADMIN คนแรก

1. เข้าเว็บ → Login ด้วย LINE ของเจ้าของร้าน
2. `ADMIN_LINE_USER_ID` ที่ตั้งไว้จะได้ admin claim อัตโนมัติ
3. ออกจากระบบแล้วเข้าใหม่ 1 ครั้ง (ให้ token ใหม่มี claim)

### 6. เปิดสรุปเช้า

1. เชิญบอทเข้ากลุ่ม LINE ของร้าน
2. พิมพ์ `ไอดีกลุ่ม` ในกลุ่มนั้น → บอทตอบ Group ID
3. เอา ID ไปใส่ที่ **/admin → LINE BOT → การแจ้งเตือน → กลุ่มที่รับสรุปเช้า**
4. ทดสอบ: พิมพ์ `ทดสอบแจ้งเตือน` ในแชทส่วนตัวกับบอท

### 7. เพิ่มพนักงาน

- **/admin → ตั้งค่า → พนักงาน** เพิ่มรายชื่อ
- ผูก LINE: ให้พนักงานเข้ากลุ่ม แล้ว admin พิมพ์ `@บอท เชื่อมพนักงาน @ชื่อพนักงาน`
  (หรือให้พนักงานส่ง `ไอดีฉัน` มาให้ แล้ว admin กรอกเอง)

---

## คำสั่งพัฒนา

```bash
npm install
npm install --prefix functions

npm run dev          # Vite + Firebase Emulators
npm run typecheck    # tsc --noEmit
npm test             # Vitest (unit tests ใน src/utils)
npm run check        # Biome lint + format
npm run build        # production build → dist/
```

---

## โครงสร้าง

```
src/
├── App.tsx                      orchestrator — routes + hooks + modals
├── components/
│   ├── admin/                   AdminPanel (router) + section panels
│   ├── auth/LoginScreen.tsx     LINE Login + dev mode
│   ├── home/                    HomeTab · RequestTab · TeamCalendar
│   ├── layout/                  Sidebar · headers · nav config
│   ├── modals/                  ยืนยันลา · โปรไฟล์ · คู่มือ
│   └── shared/                  ปุ่ม/ปฏิทิน/dropdown ที่ใช้ร่วม
├── data/useFirebaseAppData.ts   subscription + CRUD ที่เดียว
├── firebase/                    config · auth · employees · leaves · storeCalendar
├── hooks/useLeaveForm.ts        ฟอร์มยื่นลา + validation
├── utils/leaveUtils.ts          นับวันลา/โควต้า (มี unit test)
└── utils/storeCalendar.ts       วันไหนร้านเปิด-ปิด (มี unit test)

functions/src/
├── auth/                        LINE Login → Firebase custom token
├── dailySummary/                สรุปเช้า 07:30 "ใครหยุดวันนี้"
└── line/                        webhook + คำสั่งในแชท
```

Firestore collections: `employees` · `leaves` · `config/storeCalendar` ·
`config/notifications` · `config/secrets` · `loginStates` · `dailySummarySent`
