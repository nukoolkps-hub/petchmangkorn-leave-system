/**
 * config + ค่าคงที่ของ dailySummary (สรุปเช้า "ใครหยุดวันนี้")
 *
 * กลุ่ม LINE ปลายทาง **ไม่ hardcode** — admin ตั้งเองในแอป:
 *   /admin → LINE BOT → การแจ้งเตือน → "กลุ่มที่รับสรุปเช้า"
 * เก็บใน Firestore `config/notifications.dailySummaryTargets` (array ของ
 * LINE Group/Room/User ID) · หา ID กลุ่มได้ด้วยคำสั่ง "ไอดีกลุ่ม" ในกลุ่มนั้น
 */

export const APP_TIMEZONE = "Asia/Bangkok";

/** ชื่อวันเสาร์ — ใช้ skip การส่งวันเสาร์ที่ร้านปิด */
export const SAT_DAY_NAME = "เสาร์";

/** ชื่อร้านที่โชว์บนหัว flex */
export const STORE_NAME = "ห้างทองเพชรมังกร";
