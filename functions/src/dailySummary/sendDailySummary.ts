/**
 * sendDailySummary — ส่งสรุป "ใครหยุดวันนี้" เข้า LINE
 *
 * Schedule: 07:30 ทุกวัน เวลาไทย
 *
 * 1. อ่านกลุ่มปลายทางจาก `config/notifications.dailySummaryTargets`
 *    (admin ตั้งในแอป · ไม่ hardcode) — ว่าง = ไม่ส่ง
 * 2. ดึงรายชื่อพนักงานที่ลาคร่อมวันนี้
 * 3. สร้าง flex bubble → push เข้าทุกกลุ่มที่ตั้งไว้
 *
 * เสาร์ปกติ (ร้านปิด) ข้าม — ยกเว้นเสาร์ที่ admin เปิดพิเศษใน
 * `config/storeCalendar.extraOpenSaturdays`
 *
 * Idempotency: doc `dailySummarySent/{ymd}` เป็น guard
 * (claim ครั้งเดียว — กัน at-least-once delivery ของ Cloud Scheduler)
 */

import type { Firestore } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import {
	getAppFirestore,
	getLineConfig,
	isNotificationEnabled,
} from "../helpers/config.js";
import { pushLineMessage } from "../helpers/line.js";
import { buildDailySummaryFlex } from "./buildFlex.js";
import { APP_TIMEZONE, SAT_DAY_NAME, STORE_NAME } from "./config.js";
import { bangkokYmd, formatDateTH, getThaiDayName } from "./dateUtils.js";
import { fetchTodayLeaves, type LeaveItem } from "./leaves.js";

interface RunOptions {
	/** ส่งทุก message ไป LINE ID นี้แทนกลุ่มที่ตั้งไว้ (คำสั่ง "ทดสอบแจ้งเตือน") */
	targetOverride?: string;
}

interface GroupResult {
	target: string;
	sent: boolean;
	error?: string;
}

export const sendDailySummary = onSchedule(
	{
		schedule: "30 7 * * *",
		timeZone: APP_TIMEZONE,
		timeoutSeconds: 120,
	},
	async () => {
		// Admin toggle ปิดได้ใน UI: /admin → LINE BOT → การแจ้งเตือน
		if (!(await isNotificationEnabled("dailySummaryEnabled"))) {
			console.log("[sendDailySummary] disabled in admin config, skipping");
			return;
		}
		const ymd = bangkokYmd(new Date());
		const db = getAppFirestore();
		// เสาร์ปกติ (ร้านปิด) ข้าม กันรบกวน · เสาร์เปิดพิเศษยังส่ง ·
		// คำสั่ง "ทดสอบแจ้งเตือน" ของ admin ไม่ถูก skip (เรียก runDailySummary ตรง)
		if (await shouldSkipSaturday(db, ymd)) {
			console.log(
				`[sendDailySummary] เสาร์ปกติ (${ymd}) — ADMIN ไม่ได้เปิดพิเศษ · skipping`,
			);
			return;
		}
		const claimed = await claimToday(db, ymd);
		if (!claimed) {
			console.log(`[sendDailySummary] already sent for ${ymd}, skipping`);
			return;
		}
		try {
			const results = await runDailySummary();
			await db.doc(`dailySummarySent/${ymd}`).update({
				results,
				sentAt: new Date().toISOString(),
			});
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			await db
				.doc(`dailySummarySent/${ymd}`)
				.update({ error: msg })
				.catch(() => undefined);
			throw err;
		}
	},
);

/* ─── Core logic — เรียกได้ทั้ง scheduled และ LINE command ──── */

export async function runDailySummary(
	options: RunOptions = {},
): Promise<GroupResult[]> {
	const targetOverride = options.targetOverride || null;
	const now = new Date();
	const dateStr = formatDateTH(now);
	const dayName = getThaiDayName(now);

	const config = await getLineConfig();
	const token = config.LINE_CHANNEL_ACCESS_TOKEN;
	if (!token) throw new Error("LINE_CHANNEL_ACCESS_TOKEN not configured");

	const db = getAppFirestore();
	const targets = targetOverride
		? [targetOverride]
		: await fetchDailySummaryTargets(db);

	if (targets.length === 0) {
		console.warn(
			"[runDailySummary] ยังไม่ได้ตั้งกลุ่มปลายทาง — " +
				"ตั้งที่ /admin → LINE BOT → การแจ้งเตือน",
		);
		return [];
	}

	let leaves: LeaveItem[] = [];
	try {
		leaves = await fetchTodayLeaves(db, now);
	} catch (err) {
		console.error("[runDailySummary] fetchTodayLeaves error:", err);
	}

	const flex = buildDailySummaryFlex({
		groupName: STORE_NAME,
		dateStr,
		dayName,
		leaves,
	});

	const results: GroupResult[] = [];
	for (const target of targets) {
		try {
			await pushLineMessage(token, target, [flex]);
			results.push({ target, sent: true });
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			console.error(`[runDailySummary] push error for ${target}:`, msg);
			results.push({ target, sent: false, error: msg });
		}
	}
	return results;
}

/** กลุ่มปลายทางที่ admin ตั้งไว้ใน `config/notifications.dailySummaryTargets` */
async function fetchDailySummaryTargets(db: Firestore): Promise<string[]> {
	const snap = await db.doc("config/notifications").get();
	const raw = snap.data()?.dailySummaryTargets;
	if (!Array.isArray(raw)) return [];
	return raw
		.filter((id): id is string => typeof id === "string")
		.map((id) => id.trim())
		.filter(Boolean);
}

/** เสาร์ปกติ (ไม่ใช่เสาร์เปิดพิเศษ) → skip
 *  อ่าน config/storeCalendar.extraOpenSaturdays · วันอื่นส่งปกติ            */
async function shouldSkipSaturday(
	db: Firestore,
	ymd: string,
): Promise<boolean> {
	const [y, m, d] = ymd.split("-").map(Number);
	const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
	if (dow !== 6) return false; // ไม่ใช่เสาร์ → ส่งปกติ
	const snap = await db.doc("config/storeCalendar").get();
	const extraOpen =
		(snap.data()?.extraOpenSaturdays as string[] | undefined) || [];
	return !extraOpen.includes(ymd);
}

/** Atomic claim ของวันนี้ — กัน scheduler ยิงซ้ำส่งสแปม */
async function claimToday(db: Firestore, ymd: string): Promise<boolean> {
	const ref = db.doc(`dailySummarySent/${ymd}`);
	return db.runTransaction(async (tx) => {
		const snap = await tx.get(ref);
		if (snap.exists) return false;
		tx.set(ref, { ymd, claimedAt: new Date().toISOString() });
		return true;
	});
}

export { SAT_DAY_NAME };
