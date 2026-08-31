# ระบบการลา — ห้างทองเพชรมังกร

ระบบยื่นใบลาพนักงาน + โหมด ADMIN · React 19 + Firebase · เข้าสู่ระบบด้วย LINE Login

แยกออกมาจากระบบพนักงานของห้างเพชรทองมุกดา โดย **ตัดทุกอย่างที่ไม่เกี่ยวกับการลาออก**
(เงินเดือน · ค่าคอมกองกลาง · เบิกเงินล่วงหน้า · เงินกู้ · หน้าที่ประจำ · ความรู้ต่างๆ ·
ราคาทอง · สลิป/หนังสือรับรอง PDF · backup · ล้างข้อมูล)

---

## ทำอะไรได้บ้าง

**ฝั่งพนักงาน**
- หน้าแรก — โควต้าวันลาเดือนนี้ (1 วัน/เดือน) + ยอดที่ถูกหัก · สถิติลากิจ/ลาป่วย · ปฏิทินทีม
- ยื่นคำขอลา — เลือกช่วงวัน · กันยื่นทับวันตัวเอง · เห็นว่าวันนั้นเพื่อนลากี่คน ·
  เห็นยอดที่ใบลานี้จะถูกหักก่อนกดส่ง (ลาวันอาทิตย์ต้องติ๊กรับทราบก่อน)
- ลบใบลาของตัวเองได้ถ้ายังไม่ถึงวันลา
- แก้รูปโปรไฟล์ (ตัวอักษร / emoji / อัปโหลดรูป)

**ฝั่ง ADMIN**

| หมวด | หน้า | ทำอะไร |
|---|---|---|
| ปฏิทิน | ปฏิทินการลา | ปฏิทินรวมทั้งทีม + วันเปิด-ปิดร้าน |
| ปฏิทิน | วันเปิด-ปิดร้าน | เปิดเสาร์พิเศษ · ปิด จ-ศ / อาทิตย์ เป็นรายวัน |
| การลา | สรุปลา | ตารางสรุปเงินทั้งรอบทุกคน (หัก/โบนัส/สุทธิ) + ปุ่มคัดลอก · ปิด-เปิดรอบจ่าย |
| การลา | เพิ่ม - ลบ การลา | ยื่นลาแทนพนักงาน · ลบใบลา |
| LINE BOT | การแจ้งเตือน | เปิด-ปิดสรุปเช้า + ตั้งกลุ่ม LINE ปลายทาง |
| LINE BOT | คำสั่ง | รายการคำสั่งที่บอทรองรับ |
| ตั้งค่า | พนักงาน | เพิ่ม/แก้/ลบพนักงาน · ลากเรียงลำดับ |

**LINE Bot**
- สรุปเช้า 07:30 — push "ใครหยุดวันนี้" เข้ากลุ่มที่ตั้งไว้ (ข้ามเสาร์ที่ร้านปิด)
- คำสั่งในแชท: `ไอดีฉัน` · `คำสั่ง` · `ไอดีกลุ่ม` · `@บอท เชื่อมพนักงาน @คน` · `ทดสอบแจ้งเตือน`

---

## กฎการลา

| วัน | สถานะร้าน (ค่าตั้งต้น) | การลา | ถูกหัก |
|---|---|---|---|
| จันทร์–ศุกร์ | เปิด | นับเข้าโควต้า **1 วัน/เดือน** | เกินโควต้า **300 บาท/วัน** |
| เสาร์ | **ปิด** | ไม่นับ | — |
| เสาร์ ∈ `extraOpenSaturdays` | เปิด | นับเหมือนวันธรรมดา | เหมือนวันธรรมดา |
| อาทิตย์ | เปิด | นับแยก — ไม่กินโควต้าวันธรรมดา | **500 บาท/วัน ทันที** |
| อาทิตย์ ∈ `extraClosedSundays` | ปิด | ไม่นับ | — |
| จ–ศ ∈ `extraClosedWeekdays` | ปิด | ไม่นับ | — |

**วันอาทิตย์ไม่มีโควต้าช่วย** — ลาวันอาทิตย์วันแรกก็หักทันที ·
ตอนยื่นลาที่มีวันอาทิตย์ ระบบบังคับให้ติ๊กรับทราบก่อนถึงจะกดส่งได้

### รอบจ่ายเงินเดือน

ถ้าคิดเงินเดือนก่อนสิ้นเดือน (เช่นวันที่ 27) กด **"ปิดรอบ"** ที่หน้าสรุปลา
แล้วเลือกวันตัด — **วันลาหลังจากนั้นจะยกไปนับในรอบถัดไปอัตโนมัติ**

วันตัดไม่ต้องเท่ากันทุกเดือน · เดือนที่ยังไม่ปิดรอบจะนับถึงสิ้นเดือนตามปกติ ·
กดผิดวันกด "เปิดรอบกลับ" ได้

โควต้า ค่าหัก และโบนัส ผูกกับ **รอบ** ไม่ใช่เดือนปฏิทิน — พนักงานเห็นช่วงวัน
ของรอบบนการ์ดโควต้าหน้าแรก จะได้ตรงกับที่ ADMIN จ่ายจริง

### เงื่อนไขพิเศษรายเดือน

| เงื่อนไข | ผล |
|---|---|
| ลาอาทิตย์ **1 วันพอดี** และไม่ลาวันธรรมดาเลยทั้งเดือน | หักแค่ **200 บาท** (แทน 500) |
| ลาอาทิตย์ **2 วันขึ้นไป** | กลับไป **500 บาท/วัน ทุกวัน** |
| **ไม่มีวันลาที่นับเลย** ทั้งเดือน | ได้ **+1,000 บาท** |

โบนัสหลุดทันทีที่ลา 1 วัน **แม้จะอยู่ในโควต้าก็ตาม** — ตอนยื่นใบแรกของเดือน
ระบบจะบอกเลยว่า "ใบนี้ทำให้เสียโบนัส 1,000" ถึงจะยังไม่มียอดถูกหักก็ตาม ·
ลาวันที่ร้านปิดไม่ทำให้เสียโบนัส

ยอดหักเป็น **ตัวเลขให้พนักงานกับ ADMIN เห็นตรงกัน** เท่านั้น —
ระบบนี้ไม่ได้จ่ายเงินเดือน จึงไม่มีการตัดยอดอัตโนมัติที่ไหน

แก้โควต้า/อัตราหัก/โบนัสได้ที่ `src/constants.ts` → `BUSINESS_RULES`
(`WEEKDAY_LEAVE_QUOTA` · `OVER_QUOTA_WEEKDAY_DEDUCTION` · `SUNDAY_LEAVE_DEDUCTION` ·
`SINGLE_SUNDAY_ONLY_DEDUCTION` · `PERFECT_ATTENDANCE_BONUS`)

---

## ขั้นตอนติดตั้ง (ทำครั้งเดียว)

### 1. สร้าง Firebase project

1. สร้างโปรเจกต์ใหม่ที่ https://console.firebase.google.com
2. อัปเกรดเป็น **Blaze (pay as you go)** — Cloud Functions v2 + Cloud Scheduler
   ใช้บน Spark ไม่ได้ (โหลดระดับร้านเดียวอยู่ใน free tier)
3. เปิดใช้ **Firestore** — สร้าง database แบบ **Named database** ชื่อ `petchmangkorn-bot`
   (ถ้าใช้ชื่ออื่น ต้องแก้ 4 ที่: `firebase.json` · `src/firebase/config.ts` ·
   `functions/src/helpers/config.ts` · `storage.rules`)
   - Location แนะนำ `asia-southeast1`
4. เปิดใช้ **Storage** (สำหรับรูปโปรไฟล์) และ **Authentication**
5. Authentication → Sign-in method → เปิด **Anonymous** ไว้ (ระบบใช้ custom token)
6. Project settings → Your apps → Add app → **Web** → จดค่า config ไว้ใช้ขั้นตอนที่ 3

### 2. ตั้งค่า LINE

1. สร้าง **LINE Login channel** + **Messaging API channel** ที่ https://developers.line.biz
   - ⚠️ **ต้องอยู่ใต้ provider เดียวกัน** — LINE User ID ผูกกับ provider
     ถ้าคนละ provider คนเดียวกันจะได้ ID คนละค่า → `ADMIN_LINE_USER_ID`
     ที่ได้จากบอทจะไม่ตรงกับ ID ที่ได้ตอน LINE Login → login ไม่ผ่าน
2. LINE Login → Callback URL: `https://<project-id>.web.app/callback`
   - ⚠️ ต้องมี `/callback` ต่อท้าย — ตรงกับ `redirectUri` ใน
     `src/components/auth/LoginScreen.tsx` · LINE เทียบแบบตรงตัวอักษร
     ไม่ตรง = `400 Invalid redirect_uri value`
   - เพิ่ม `http://localhost:5173/callback` ไว้ด้วยถ้าจะ dev ในเครื่อง
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

### 4. สิทธิ์ IAM + API ที่ต้องเปิด

Firebase CLI พยายามเปิด API ที่ขาดให้เอง แต่ service account ที่ deploy
ไม่มีสิทธิ์เปิด → deploy จะ fail พร้อมข้อความ `Permissions denied enabling ...`
เปิดเองล่วงหน้าให้ครบจะเร็วกว่าไล่แก้ทีละรอบ

**เปิด API ทั้งหมดนี้** (Google Cloud Console → APIs & Services → Library):

| API | ใช้ตอน |
|---|---|
| `cloudfunctions.googleapis.com` | deploy functions |
| `cloudbuild.googleapis.com` | build container ของ functions |
| `artifactregistry.googleapis.com` | เก็บ container image |
| `run.googleapis.com` | Functions v2 รันบน Cloud Run |
| `eventarc.googleapis.com` | Functions v2 |
| `cloudscheduler.googleapis.com` | สรุปเช้า 07:30 |
| `firebasestorage.googleapis.com` | deploy storage rules |
| `iamcredentials.googleapis.com` | เซ็น custom token ตอน LINE Login |

**Role ของ service account ที่ deploy** (ตัวที่ใส่ใน `FIREBASE_SERVICE_ACCOUNT`)
— Google Cloud Console → IAM:

| Role | ขาดแล้วเกิดอะไร |
|---|---|
| `Firebase Admin` | deploy hosting / rules ไม่ได้ |
| `Cloud Functions Admin` | deploy functions ไม่ได้ |
| `Service Account User` | deploy functions ไม่ได้ |
| `Cloud Scheduler Admin` | `sendDailySummary` deploy ไม่ผ่าน (`cloudscheduler.jobs.update` denied) |
| `Service Usage Admin` | ไม่จำเป็นถ้าเปิด API เองครบแล้ว · มีไว้ให้ CLI เปิด API ที่ขาดได้เอง |

**⚠️ สิทธิ์เซ็น custom token** — Functions v2 รันด้วย compute default service
account (`<PROJECT_NUMBER>-compute@developer.gserviceaccount.com`) ซึ่ง
**ไม่มีสิทธิ์เซ็น JWT มาแต่แรก** → `createCustomToken()` ใน `lineAuth` โยน
error → LINE Login ได้ `500 INTERNAL`

แก้: IAM & Admin → Service Accounts → เลือก SA ตัวนั้น → แท็บ **PERMISSIONS**
→ **GRANT ACCESS** → principal = **email ของตัวมันเอง** → role
**`Service Account Token Creator`**

(ให้บนตัว SA เอง ไม่ใช่ระดับ project — แคบกว่า ปลอดภัยกว่า)

### 5. Deploy

push เข้า `main` → GitHub Actions deploy ให้อัตโนมัติทั้ง 4 อย่าง
(Hosting · Functions · Firestore rules · Storage rules)

### 6. ตั้ง ADMIN คนแรก

1. เข้าเว็บ → Login ด้วย LINE ของเจ้าของร้าน
2. `ADMIN_LINE_USER_ID` ที่ตั้งไว้จะได้ admin claim อัตโนมัติ
3. ออกจากระบบแล้วเข้าใหม่ 1 ครั้ง (ให้ token ใหม่มี claim)

### 7. เปิดสรุปเช้า

1. เชิญบอทเข้ากลุ่ม LINE ของร้าน
2. พิมพ์ `ไอดีกลุ่ม` ในกลุ่มนั้น → บอทตอบ Group ID
3. เอา ID ไปใส่ที่ **/admin → LINE BOT → การแจ้งเตือน → กลุ่มที่รับสรุปเช้า**
4. ทดสอบ: พิมพ์ `ทดสอบแจ้งเตือน` ในแชทส่วนตัวกับบอท

### 8. เพิ่มพนักงาน

- **/admin → ตั้งค่า → พนักงาน** เพิ่มรายชื่อ
- ผูก LINE: ให้พนักงานเข้ากลุ่ม แล้ว admin พิมพ์ `@บอท เชื่อมพนักงาน @ชื่อพนักงาน`
  (หรือให้พนักงานส่ง `ไอดีฉัน` มาให้ แล้ว admin กรอกเอง)

---

## แก้ปัญหาที่เจอบ่อยตอนติดตั้ง

| อาการ | สาเหตุ | แก้ |
|---|---|---|
| Deploy fail: `Permissions denied enabling <api>` | service account เปิด API เองไม่ได้ | เปิด API ตามตารางในขั้นตอนที่ 4 |
| `sendDailySummary` deploy ไม่ผ่าน — `cloudscheduler.jobs.update` denied | ขาด role | ให้ `Cloud Scheduler Admin` |
| LINE กด Verify webhook → `401 Unauthorized` | `LINE_CHANNEL_SECRET` ผิดค่า (มักหยิบของ LINE Login มาใส่) | ใช้ Channel secret ของ **Messaging API** |
| LINE กด Verify webhook → `503 webhook not configured` | ไม่มี `LINE_CHANNEL_SECRET` ใน `config/secrets` หรืออยู่ผิด database | เช็คว่า doc อยู่ใน database `petchmangkorn-bot` ไม่ใช่ `(default)` |
| กดปุ่ม Login → `400 Invalid redirect_uri value` | Callback URL ไม่ตรง | ใส่ `https://<project-id>.web.app/callback` (มี `/callback`) |
| กดปุ่ม Login → `400 invalid client_id` | `VITE_LINE_LOGIN_CHANNEL_ID` ผิด | ใช้ Channel ID ของ **LINE Login** channel |
| Login → `500 INTERNAL` ที่ `lineAuth` | compute SA เซ็น custom token ไม่ได้ | ให้ `Service Account Token Creator` (ดูขั้นตอนที่ 4) |
| Login สำเร็จ แต่ขึ้น "บัญชี LINE นี้ยังไม่ได้ถูกเพิ่มโดยผู้ดูแลระบบ" | ID ไม่ตรง `ADMIN_LINE_USER_ID` และยังไม่มี record พนักงาน | ก๊อป ID จากที่บอทตอบ `ไอดีฉัน` มาวางใหม่ · เช็คว่า 2 channel อยู่ provider เดียวกัน |
| เข้าได้แต่ไม่เห็นเมนู `/admin` | token เก่ายังไม่มี claim | logout แล้ว login ใหม่ 1 ครั้ง |
| ปุ่ม Login ขึ้น "ยังไม่ได้ตั้งค่า VITE_LINE_LOGIN_CHANNEL_ID" | ตั้ง GitHub Variable แล้วแต่ยังไม่ได้ build ใหม่ | Actions → Deploy → Run workflow |

> `ADMIN_LINE_USER_ID` ใส่หลายคนได้ — คั่นด้วย comma หรือเว้นวรรค ·
> ทุกครั้งที่ admin login ระบบจะเพิกถอน admin claim ของคนที่ไม่อยู่ในลิสต์นี้

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
├── utils/leaveUtils.ts          นับวันลา/โควต้า/ค่าหัก (มี unit test)
└── utils/storeCalendar.ts       วันไหนร้านเปิด-ปิด (มี unit test)

functions/src/
├── auth/                        LINE Login → Firebase custom token
├── dailySummary/                สรุปเช้า 07:30 "ใครหยุดวันนี้"
└── line/                        webhook + คำสั่งในแชท
```

Firestore collections: `employees` · `leaves` · `config/storeCalendar` ·
`config/notifications` · `config/secrets` · `loginStates` · `dailySummarySent`
