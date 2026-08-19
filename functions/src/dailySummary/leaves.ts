/**
 * ดึงรายชื่อพนักงานหยุดวันนี้ (ใช้ใน flex section)
 *
 * ย้ายมาจาก functions/src/leave/notifyDailyLeaves.ts เพื่อให้ใช้ร่วมกับ
 * sendDailySummary ได้ ใช้ snapshot ของ employees + leaves ที่อ่านครั้งเดียว
 * (แทนที่จะ query ใน loop)
 */

import type { Firestore } from "firebase-admin/firestore";
import { bangkokYmd } from "./dateUtils.js";

export interface LeaveItem {
	nickname: string;
	kindLabel: string;
	dateLabel: string;
}

const THAI_MONTHS_SHORT = [
	"ม.ค.",
	"ก.พ.",
	"มี.ค.",
	"เม.ย.",
	"พ.ค.",
	"มิ.ย.",
	"ก.ค.",
	"ส.ค.",
	"ก.ย.",
	"ต.ค.",
	"พ.ย.",
	"ธ.ค.",
];

export async function fetchTodayLeaves(
	db: Firestore,
	now: Date,
): Promise<LeaveItem[]> {
	const ymd = bangkokYmd(now);

	// query end >= today → filter start <= today ใน memory
	// (Firestore ห้าม inequality 2 fields)
	const leavesSnap = await db
		.collection("leaves")
		.where("end", ">=", ymd)
		.get();

	const todayLeaves = leavesSnap.docs
		.map((d) => d.data() as Record<string, unknown>)
		.filter((leave) => {
			const start = String(leave.start || "");
			const end = String(leave.end || "");
			return start <= ymd && end >= ymd;
		});

	if (todayLeaves.length === 0) return [];

	// join กับ employees → nickname
	const empSnap = await db.collection("employees").get();
	const empById = new Map<string, Record<string, unknown>>();
	for (const e of empSnap.docs) empById.set(e.id, e.data());

	return todayLeaves.map((leave) => {
		const employeeId = String(leave.employeeId || "");
		const emp = empById.get(employeeId);
		const nicknameVal = emp?.nickname;
		const nameVal = emp?.name;
		const fallbackVal = leave.employeeName;
		const nickname =
			(typeof nicknameVal === "string" && nicknameVal.trim()) ||
			(typeof nameVal === "string" && nameVal.trim()) ||
			(typeof fallbackVal === "string" && fallbackVal.trim()) ||
			"-";
		const kindLabel = leave.type === "sick" ? "ลาป่วย" : "ลากิจ";
		const start = String(leave.start || "");
		const end = String(leave.end || "");
		const dateLabel =
			start === end
				? "วันเดียว"
				: `${formatShortDate(start)} – ${formatShortDate(end)}`;
		return { nickname, kindLabel, dateLabel };
	});
}

function formatShortDate(ymd: string): string {
	const parts = ymd.split("-");
	if (parts.length !== 3) return ymd;
	const m = parseInt(parts[1], 10);
	const d = parseInt(parts[2], 10);
	return `${d} ${THAI_MONTHS_SHORT[m - 1] || ""}`;
}
