/**
 * Recompute daily duty assignments + write self-contained snapshot to
 * /dutyAssignmentsToday/snapshot.
 *
 * ทำไม:
 * - Client-side compute ฝั่งพนักงานเห็นแค่ employee/leave ของตัวเอง
 *   (Firestore rules ปิดไว้) → activePool() เหลือแค่ตัวเอง → rotation ผิด
 * - แก้: Cloud Function อ่านด้วย admin SDK (เห็นทุก collection) → compute
 *   ทั้ง assignments + safe employee directory ใส่ลง 1 doc public
 *
 * Snapshot ออกแบบเป็น "self-contained" — ไม่ต้องอ่าน employees/leaves เพิ่ม
 * client แค่ subscribe doc เดียวแล้ว render ตรงๆ
 *
 * Trigger:
 * - HTTP callable (client เรียกหลัง CRUD ทุกอันที่มีผลกับ rotation)
 * - Scheduled daily 00:01 Bangkok (refresh ตอนวันเปลี่ยน)
 */

import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { bangkokYmd } from "../dailySummary/dateUtils.js";
import { getAppFirestore } from "../helpers/config.js";
import {
	computeAllDutiesForDay,
	computeCoverageForecast,
	type Duty,
	type Employee,
	getPeriodIndex,
	type LeaveEntry,
	monthlyPrimariesForDay,
	replayCoverageHistory,
	replayRotationSubHistory,
	resolveDutyPool,
} from "./dutyUtils.js";

const APP_TIMEZONE = "Asia/Bangkok";

/** Safe employee projection — เปิดอ่านได้ทั่ว ไม่มี sensitive field
 *  (lineUserId, prefix, วันเริ่มงาน ฯลฯ) */
interface SafeEmployee {
	id: string;
	name: string;
	nickname: string;
	avatar: string;
	avatarType: "text" | "emoji" | "image";
	avatarImageUrl: string | null;
	displayOrder: number | null;
}

interface AssignmentItem {
	dutyId: string;
	dutyName: string;
	kind: "rotation" | "coverage";
	period: "weekly" | "monthly";
	primaryEmpId: string | null;
	actualEmpId: string | null;
	targetEmpId: string | null; // coverage: คนในกลุ่มเป้าหมายที่ลา
	targetName: string | null; // ชื่อ/ชื่อเล่นของ target (denorm สำหรับ display)
	reason:
		| "rotation"
		| "substitute_for_leave"
		| "double_up"
		| "all_on_leave"
		| "empty_pool"
		| "coverage"
		| "coverage_no_candidate"
		| "empty_target_role"
		| "target_present";
	/** คนหลักไม่ได้ลา แต่ติดหน้าที่อื่นวันนี้ (ผูกขาด/ถูกดึงไปแทน) →
	 *  UI เขียน "แทน X (ติดหน้าที่อื่น)" แทน "(ลา)" */
	primaryPulledToDuty: boolean;
	periodStart: string;
	periodEnd: string;
	pool: SafeEmployee[]; // rotation: สมาชิก pool · coverage: รายชื่อคนแทน
}

/** คนแทนกลุ่มเป้าหมายล่วงหน้า (จากใบลาที่ยื่นไว้) — ให้ทุกคน (รวมพนักงาน)
 *  ดูล่วงหน้าได้ว่าช่วงไหนใครลา ใครมาแทน · denorm ชื่อไว้เพราะ target อยู่คนละ
 *  กลุ่มกับ pool (ไม่มีใน empById ฝั่ง client) */
interface CoverageForecastItem {
	dutyId: string;
	dutyName: string;
	start: string;
	end: string;
	targetEmpId: string;
	targetName: string | null;
	substituteEmpId: string | null;
	substituteName: string | null;
}

/** pool ของ "ทุก" duty (ไม่ขึ้นกับว่าวันนี้หน้าที่นั้นทำงานไหม) — การ์ด +
 *  forecast ใช้ตัวนี้เป็นแหล่ง pool เสมอ · กันเคสวันอาทิตย์ที่ weekly+skipSundays
 *  ถูกตัดออกจาก assignments (applicableDuties) แล้วไม่มี pool → การ์ดขึ้น
 *  "0 คน" / forecast ขึ้น "ยังไม่มีคน" ทั้งเดือน (ทั้งที่มีคนจริง) */
interface DutyPoolInfo {
	pool: SafeEmployee[];
}

interface Snapshot {
	date: string;
	assignments: AssignmentItem[];
	coverageForecast: CoverageForecastItem[];
	/** dutyId → pool ของทุก duty (roster) · อาจไม่มีใน snapshot เก่า */
	dutyPools: Record<string, DutyPoolInfo>;
	updatedAt: number;
}

function toSafe(e: Employee): SafeEmployee {
	return {
		id: e.id,
		name: e.name || "",
		nickname: e.nickname || "",
		avatar: e.avatar || "",
		avatarType: e.avatarType || "text",
		avatarImageUrl: e.avatarImageUrl || null,
		displayOrder: typeof e.displayOrder === "number" ? e.displayOrder : null,
	};
}

async function buildSnapshot(): Promise<Snapshot> {
	const db = getAppFirestore();
	const ymd = bangkokYmd(new Date());

	// coverage ต้อง replay ตั้งแต่ต้นปีเพื่อนับ "ใครแทนไปกี่ครั้ง" (ยุติธรรม)
	// → ดึง leaves ทั้งปี (end >= 1 ม.ค. ปีนี้)
	const yearStart = `${ymd.slice(0, 4)}-01-01`;

	const [dutiesSnap, employeesSnap, leavesSnap, calendarSnap] =
		await Promise.all([
			db.collection("duties").get(),
			db.collection("employees").get(),
			db.collection("leaves").where("end", ">=", yearStart).get(),
			db.doc("config/storeCalendar").get(),
		]);

	const calendarData = calendarSnap.exists ? calendarSnap.data() || {} : {};
	const storeCalendar = {
		extraOpenSaturdays: Array.isArray(calendarData.extraOpenSaturdays)
			? (calendarData.extraOpenSaturdays as string[])
			: [],
		extraClosedWeekdays: Array.isArray(calendarData.extraClosedWeekdays)
			? (calendarData.extraClosedWeekdays as string[])
			: [],
		extraClosedSundays: Array.isArray(calendarData.extraClosedSundays)
			? (calendarData.extraClosedSundays as string[])
			: [],
	};

	const duties: Duty[] = dutiesSnap.docs
		.map((d) => ({ id: d.id, ...d.data() }) as Duty)
		.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

	const employees: Employee[] = employeesSnap.docs.map(
		(d) => ({ id: d.id, ...d.data() }) as Employee,
	);

	// leaves ทั้งปี (สำหรับ replay coverage) + leaves วันนี้ (สำหรับ rotation)
	const allLeaves: LeaveEntry[] = leavesSnap.docs.map(
		(d) => d.data() as LeaveEntry,
	);
	const leaves: LeaveEntry[] = allLeaves.filter(
		(l) => l.start <= ymd && l.end >= ymd,
	);

	// history การแทน (เฉพาะวันก่อนหน้า → ไม่นับวันนี้) เพื่อเลือกคนยุติธรรม
	// ต้องส่ง monthlyDuties ด้วย เพื่อให้ replay exclude คนที่ทำหน้าที่ประจำเดือน
	// ของแต่ละวัน (monthly primaries เปลี่ยนทุกเดือน → ต้องคำนวณรายวัน)
	const coverageDuties = duties.filter((d) => d.kind === "coverage");
	const monthlyDuties = duties.filter(
		(d) => d.kind !== "coverage" && d.period === "monthly",
	);
	const coverageHistory = replayCoverageHistory(
		coverageDuties,
		monthlyDuties,
		employees,
		allLeaves,
		yearStart,
		ymd, // exclusive → ถึงเมื่อวาน
		storeCalendar,
	);

	// fairness history ของ "คนแทน" หน้าที่หมุนเวียน (weekly + monthly) — replay
	// ตั้งแต่ต้นปีต่อ duty → เลือกคนแทนแบบยุติธรรม (เคยแทนน้อยสุดก่อน) · หน้าที่
	// รายสัปดาห์กันคนหลักรายเดือนออกจาก pool คนแทน (คนรายเดือนไม่แทนรายสัปดาห์ —
	// ตรงกับ preferredPool ของ computeDutyForDay ที่ excludeForPrimary=lockedByMonthly)
	const monthlyPrimaryIds = monthlyPrimariesForDay(
		monthlyDuties,
		ymd,
		employees,
	);
	const rotationSubHistory = new Map<string, Map<string, number>>(
		duties
			.filter((d) => d.kind !== "coverage")
			.map((d) => {
				const fullPool = resolveDutyPool(d, employees).map((e) => e.id);
				const pool =
					d.period === "weekly"
						? fullPool.filter((id) => !monthlyPrimaryIds.has(id))
						: fullPool;
				return [
					d.id,
					replayRotationSubHistory(
						d,
						pool,
						allLeaves,
						storeCalendar,
						yearStart,
						ymd,
					),
				];
			}),
	);

	const assignments = computeAllDutiesForDay(
		duties,
		ymd,
		employees,
		leaves,
		coverageHistory,
		storeCalendar,
		rotationSubHistory,
	);

	// B · write-back cache: stamp primaryEmpId + periodIndex ของ rotation
	// duties ลง /duties/{id}.cachedPrimary — สำหรับ read next time จะ skip
	// computation ใช้ค่านี้ตรงๆ (กัน pool เปลี่ยนกลาง period ส่งผลต่อ
	// primary). Batch + เปรียบเทียบก่อนเขียนเพื่อลด write ไม่จำเป็น
	const writes: Promise<unknown>[] = [];
	for (const a of assignments) {
		if (a.kind === "coverage") continue;
		if (!a.primaryEmpId) continue;
		const duty = duties.find((d) => d.id === a.dutyId);
		if (!duty) continue;
		const periodIdx = Math.max(0, getPeriodIndex(duty, ymd));
		const existing = duty.cachedPrimary;
		const same =
			existing?.empId === a.primaryEmpId && existing?.periodIndex === periodIdx;
		if (same) continue;
		writes.push(
			db
				.doc(`duties/${duty.id}`)
				.set(
					{ cachedPrimary: { periodIndex: periodIdx, empId: a.primaryEmpId } },
					{ merge: true },
				),
		);
	}
	if (writes.length > 0) {
		const results = await Promise.allSettled(writes);
		const failed = results.filter((r) => r.status === "rejected").length;
		if (failed > 0) {
			console.error(
				`[recompute] cache write-back: ${failed}/${writes.length} duty docs failed`,
			);
		}
	}

	// dutyId → display pool (rotation: คนที่ admin เลือก · coverage: รายชื่อคนแทน)
	const empById = new Map(employees.map((e) => [e.id, e]));
	const poolFor = (duty: Duty): SafeEmployee[] =>
		duty.kind === "coverage"
			? (duty.candidateEmpIds || [])
					.map((id) => empById.get(id))
					.filter((e): e is Employee => !!e)
					.map(toSafe)
			: resolveDutyPool(duty, employees).map(toSafe);

	// pool ของ "ทุก" duty (roster) — การ์ด + forecast อ่านจากตัวนี้เสมอ เพื่อให้
	// มี pool แม้วันที่หน้าที่นั้นหยุด (อาทิตย์ที่ skipSundays / ร้านปิด) ที่
	// assignments ไม่มี entry ให้ · กันขึ้น "0 คน" / "ยังไม่มีคน" ทั้งเดือน
	const dutyPools: Record<string, DutyPoolInfo> = {};
	for (const duty of duties) {
		dutyPools[duty.id] = { pool: poolFor(duty) };
	}

	const items: AssignmentItem[] = assignments.map((a) => {
		const duty = duties.find((d) => d.id === a.dutyId);
		const pool = duty ? poolFor(duty) : [];
		return {
			dutyId: a.dutyId,
			dutyName: a.dutyName,
			kind: a.kind || "rotation",
			period: a.period,
			primaryEmpId: a.primaryEmpId,
			actualEmpId: a.actualEmpId,
			targetEmpId: a.targetEmpId ?? null,
			targetName: a.targetEmpId
				? empById.get(a.targetEmpId)?.nickname ||
					empById.get(a.targetEmpId)?.name ||
					null
				: null,
			reason: a.reason,
			// เขียนเป็น boolean เสมอ — Firestore ไม่รับ undefined
			primaryPulledToDuty: a.primaryPulledToDuty === true,
			periodStart: a.periodStart,
			periodEnd: a.periodEnd,
			pool,
		};
	});

	// coverage forecast → สิ้นปี · denorm ชื่อ target/คนแทน (target อยู่คนละ
	// กลุ่มกับ pool → ฝั่ง client ไม่มีใน empById)
	const yearEnd = `${ymd.slice(0, 4)}-12-31`;
	const coverageForecast: CoverageForecastItem[] = computeCoverageForecast(
		duties,
		employees,
		allLeaves,
		ymd,
		yearEnd,
		storeCalendar,
	).map((e) => {
		const target = empById.get(e.targetEmpId);
		const sub = e.substituteEmpId ? empById.get(e.substituteEmpId) : null;
		return {
			dutyId: e.dutyId,
			dutyName: e.dutyName,
			start: e.start,
			end: e.end,
			targetEmpId: e.targetEmpId,
			targetName: target?.nickname || target?.name || null,
			substituteEmpId: e.substituteEmpId,
			substituteName: sub ? sub.nickname || sub.name || null : null,
		};
	});

	return {
		date: ymd,
		assignments: items,
		coverageForecast,
		dutyPools,
		updatedAt: Date.now(),
	};
}

async function writeSnapshot(): Promise<Snapshot> {
	const snap = await buildSnapshot();
	const db = getAppFirestore();
	await db.doc("dutyAssignmentsToday/snapshot").set(snap);
	return snap;
}

/** HTTP callable — client เรียกหลัง duty/employee/leave CRUD เพื่อ refresh
 *  snapshot real-time · ต้อง signed-in (auth.uid ใดๆ ก็ได้)               */
export const recomputeDutyAssignments = onCall(async (request) => {
	if (!request.auth?.uid) {
		throw new HttpsError("unauthenticated", "ต้อง sign-in ก่อน");
	}
	try {
		const snap = await writeSnapshot();
		return { ok: true, date: snap.date, count: snap.assignments.length };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error("[recomputeDutyAssignments] error:", msg);
		throw new HttpsError("internal", msg);
	}
});

/** Scheduled daily 00:01 Bangkok — refresh ตอนวันเปลี่ยน · period index
 *  ของ weekly/monthly เปลี่ยน → primary หมุน                                */
export const recomputeDutyAssignmentsDaily = onSchedule(
	{
		schedule: "1 0 * * *",
		timeZone: APP_TIMEZONE,
		timeoutSeconds: 60,
	},
	async () => {
		try {
			const snap = await writeSnapshot();
			console.log(
				`[recomputeDutyAssignmentsDaily] wrote ${snap.assignments.length} assignments for ${snap.date}`,
			);
		} catch (err) {
			console.error("[recomputeDutyAssignmentsDaily] error:", err);
			throw err;
		}
	},
);
