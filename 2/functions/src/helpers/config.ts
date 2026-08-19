/**
 * Shared config & helpers
 */

import { getFirestore } from "firebase-admin/firestore";
import type { LineConfig } from "../types.js";

export const FIRESTORE_DATABASE_ID =
	process.env.FIRESTORE_DATABASE_ID || "petchmangkorn-bot";

export function getAppFirestore() {
	return getFirestore(FIRESTORE_DATABASE_ID);
}

/* ─── Color palette (LINE Flex Messages) ──────────────────────── */
export const COLORS = {
	maroon: "#7B1C1C",
	goldLight: "#E8C87A",
	goldPale: "#F5E6C8",
	text: "#2D1A0E",
	textMedium: "#7A5C3A",
	green: "#1A6B3A",
	greenLight: "#E8F5EE",
	red: "#C0392B",
} as const;

/* ─── Thai number formatter ───────────────────────────────────── */
export const formatThaiNumber = (n: number | string | undefined): string =>
	Number(n || 0).toLocaleString("th-TH");

/* ─── Read LINE secrets from Firestore ──────────────────────────
   trim field names + string values — กัน user/admin พิมพ์ space
   ติดมาตอนสร้าง field ใน Firestore Console (เคยมีเคส
   "ANTHROPIC_API_KEY " ที่ trailing space ทำให้อ่านไม่เจอ)         */
export async function getLineConfig(): Promise<LineConfig> {
	const db = getAppFirestore();
	const doc = await db.doc("config/secrets").get();
	const raw = doc.data();
	if (!raw) return {};
	const cleaned: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(raw)) {
		const trimmedKey = key.trim();
		cleaned[trimmedKey] = typeof value === "string" ? value.trim() : value;
	}
	return cleaned as LineConfig;
}

/* ─── Notification toggle (admin UI: LINE BOT > การแจ้งเตือน) ─────
   อ่าน config/notifications doc — default semantic: missing field /
   !== false → enabled. เฉพาะ === false เท่านั้นที่ skip

   Cache 60 วินาที — processAdvanceNotifications รันทุกนาที → ลด
   Firestore read จาก 1440/วัน → ~24/วัน per warm instance              */
const NOTIFICATION_CACHE_TTL_MS = 60_000;
let notificationCache: {
	settings: Record<string, unknown> | undefined;
	expiresAt: number;
} = { settings: undefined, expiresAt: 0 };

export async function isNotificationEnabled(
	field:
		| "dailySummaryEnabled"
		| "advanceRequestEnabled"
		| "advanceApprovalEnabled"
		| "loanCreatedEnabled",
): Promise<boolean> {
	const now = Date.now();
	if (now > notificationCache.expiresAt) {
		try {
			const doc = await getAppFirestore().doc("config/notifications").get();
			notificationCache = {
				settings: doc.data() as Record<string, unknown> | undefined,
				expiresAt: now + NOTIFICATION_CACHE_TTL_MS,
			};
		} catch (err) {
			console.warn(
				"[isNotificationEnabled] read failed, defaulting to enabled:",
				err,
			);
			// Fail-safe: ส่งต่อ ไม่ block (แต่ไม่ update cache → retry รอบหน้า)
			return true;
		}
	}
	return notificationCache.settings?.[field] !== false;
}

/* ─── Check if LINE user ID is in admin list ─────────────────── */
export function isConfiguredAdminLineUser(
	lineUserId: string,
	configValue: string | undefined,
): boolean {
	return (
		configValue
			?.split(/[,\s]+/)
			.map((value) => value.trim())
			.filter(Boolean)
			.includes(lineUserId) || false
	);
}
