/**
 * ตัวช่วยจัดการเวลา/วันที่ในโซน Asia/Bangkok สำหรับ dailySummary
 */

import { APP_TIMEZONE } from "./config.js";

const THAI_DAY_NAMES = [
	"อาทิตย์",
	"จันทร์",
	"อังคาร",
	"พุธ",
	"พฤหัสบดี",
	"ศุกร์",
	"เสาร์",
] as const;
export type ThaiDayName = (typeof THAI_DAY_NAMES)[number];

const SHORT_TO_INDEX: Record<string, number> = {
	Sun: 0,
	Mon: 1,
	Tue: 2,
	Wed: 3,
	Thu: 4,
	Fri: 5,
	Sat: 6,
};

/** "วันศุกร์" → "ศุกร์" (no prefix) */
export function getThaiDayName(date: Date): ThaiDayName {
	const fmt = new Intl.DateTimeFormat("en-US", {
		timeZone: APP_TIMEZONE,
		weekday: "short",
	});
	const idx = SHORT_TO_INDEX[fmt.format(date)] ?? 0;
	return THAI_DAY_NAMES[idx];
}

/** วันนี้ใน Bangkok timezone → "dd/mm/yyyy" · ปี = พ.ศ. (= ค.ศ. + 543) */
export function formatDateTH(date: Date): string {
	const [y, m, d] = bangkokYmd(date).split("-");
	return `${d}/${m}/${parseInt(y, 10) + 543}`;
}

/** Bangkok yyyy-mm-dd ของวันนั้น (ใช้ query Firestore leaves) */
export function bangkokYmd(date: Date): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: APP_TIMEZONE,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(date);
}

/** ช่วง 00:00 - 23:59 ของวันใน Bangkok เป็น ISO (ใช้ query Google Calendar) */
export function getThaiDayRange(date: Date): {
	startISO: string;
	endISO: string;
} {
	const ymd = bangkokYmd(date);
	return {
		startISO: `${ymd}T00:00:00+07:00`,
		endISO: `${ymd}T23:59:59+07:00`,
	};
}
