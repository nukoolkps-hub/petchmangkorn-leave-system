/**
 * Firebase Cloud Functions — ห้างทองเพชรมังกร ระบบการลา
 * Barrel file: re-exports all functions so Firebase discovers them.
 */

import { initializeApp } from "firebase-admin/app";
import { setGlobalOptions } from "firebase-functions/v2";

initializeApp();
setGlobalOptions({ region: "asia-southeast1" });

// Authentication — LINE Login + dev mode + admin claim
export { bootstrapAdmin } from "./auth/bootstrapAdmin.js";
export { devAuth } from "./auth/devAuth.js";
export { lineAuth } from "./auth/lineAuth.js";
// OAuth state token issuer — server-side CSRF defense (pair กับ lineAuth)
export { prepareLineLogin } from "./auth/prepareLineLogin.js";
export { seedLineConfigFromEnv } from "./auth/seedLineConfigFromEnv.js";
export { setAdmin } from "./auth/setAdmin.js";
// สรุปเช้า "ใครหยุดวันนี้" → push เข้ากลุ่ม LINE 07:30 ทุกวัน
// (ทดสอบ: พิมพ์ "ทดสอบแจ้งเตือน" ใน LINE 1:1 chat กับ admin)
export { sendDailySummary } from "./dailySummary/sendDailySummary.js";
// LINE webhook — คำสั่งใน chat (ไอดีกลุ่ม / ไอดีของฉัน / ผูกพนักงาน ฯลฯ)
export { lineWebhook } from "./line/webhook.js";
