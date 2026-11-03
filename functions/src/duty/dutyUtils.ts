/**
 * Duty rotation + substitute logic — server-side port of src/utils/dutyUtils.ts
 *
 * Pure functions: รับ duties + employees + leaves → output assignments
 * Algorithm ตรงกับ client เป๊ะ (admin local compute = server result)
 *
 * port จากระบบเพชรทองมุกดา — pool = duty.memberEmpIds (ไม่มีตำแหน่ง) ·
 * coverage target = duty.coverageTargetEmpIds · ไม่มีเรื่องเงิน
 */

export interface Duty {
	id: string;
	name: string;
	kind?: "rotation" | "coverage";
	period: "weekly" | "monthly";
	/** (rotation) คนที่ admin เลือกให้หมุนทำหน้าที่นี้ */
	memberEmpIds?: string[];
	/** (rotation) คนที่หมุนเป็นเวรหลักได้ แต่ไม่ให้ถูกเลือกเป็นคนแทน */
	substituteExcludedEmpIds?: string[];
	rotationStartDate: string; // "YYYY-MM-DD"
	/** (rotation) admin เลือก "คนเริ่ม" ของรอบแรก — anchor ของ round-robin
	 *  แทน hashDutyId · "" / unset / คนหลุด pool → fallback hash (เดิม) */
	rotationStartEmpId?: string;
	/** (coverage) คนที่ "ถ้าลา ต้องหาคนแทน" */
	coverageTargetEmpIds?: string[];
	candidateEmpIds?: string[];
	/** (weekly) ข้ามวันอาทิตย์ — focus ขายแทน */
	skipSundays?: boolean;
	/** "ผูกขาดคนทำ" — คนที่ทำหน้าที่นี้ในวันนั้น (คนหลักหรือคนแทน) จะไม่ถูก
	 *  จัดหน้าที่อื่นเลยในวันเดียวกัน · default = false (พฤติกรรมเดิม) */
	exclusive?: boolean;
	/** Primary cache (B) — pool เปลี่ยนกลาง period ไม่กระทบคนทำหน้าที่ */
	cachedPrimary?: {
		periodIndex: number;
		empId: string;
	} | null;
	createdAt?: number;
	updatedAt?: number;
}

/** วันอาทิตย์ของวันที่ ymd ("YYYY-MM-DD") — parse แบบ local-date เลี่ยง TZ
 *  ⚠️ ต้องเหมือน src/utils/dutyUtils.ts เป๊ะ                              */
export function isSunday(ymd: string): boolean {
	const [y, m, d] = ymd.split("-").map(Number);
	return new Date(y, m - 1, d).getDay() === 0;
}

interface StoreCalendarLite {
	extraOpenSaturdays: string[];
	extraClosedWeekdays: string[];
	extraClosedSundays?: string[];
}

/** filter หน้าที่ที่ "applicable วันนี้":
 *  - ร้านปิด (เสาร์ default หรือ admin mark ปิด) → [] (ไม่มีหน้าที่)
 *  - อาทิตย์ปิดพิเศษ → [] (ไม่มีหน้าที่)
 *  - อาทิตย์เปิด → ตัด weekly+skipSundays (per-duty opt-out)
 *  - วันทำงานอื่น → ทุกหน้าที่ปกติ                                        */
export function applicableDuties(
	duties: Duty[],
	todayYmd: string,
	calendar?: StoreCalendarLite | null,
): Duty[] {
	const [y, m, d] = todayYmd.split("-").map(Number);
	const dow = new Date(y, m - 1, d).getDay();
	// เสาร์: ปิด default ยกเว้นใน extraOpenSaturdays
	if (dow === 6 && !(calendar?.extraOpenSaturdays || []).includes(todayYmd)) {
		return [];
	}
	// จันทร์-ศุกร์ ที่อยู่ใน extraClosedWeekdays → ปิดพิเศษ
	if (
		dow !== 0 &&
		dow !== 6 &&
		(calendar?.extraClosedWeekdays || []).includes(todayYmd)
	) {
		return [];
	}
	// อาทิตย์: ปิดพิเศษ → [] · เปิด → ใช้ per-duty opt-out
	if (dow === 0) {
		if ((calendar?.extraClosedSundays || []).includes(todayYmd)) {
			return [];
		}
		return duties.filter((dt) => !(dt.period === "weekly" && dt.skipSundays));
	}
	return duties;
}

/** FNV-1a 32-bit hash (A) — stable slot per duty.id แทนตำแหน่งใน array
 *  ⚠️ ต้องเหมือน src/utils/dutyUtils.ts เป๊ะ (client/server compute ตรงกัน) */
export function hashDutyId(id: string): number {
	let h = 2166136261;
	for (let i = 0; i < id.length; i++) {
		h ^= id.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

/** เลือก primary (A+B) — cache → hash base → skip-collision (กระจายคน)
 *  used = คนที่เป็น primary ของหน้าที่อื่นในรอบนี้แล้ว · คืน null เมื่อ pool
 *  ว่าง (safety net) · ⚠️ ต้องตรงกับ src/utils/dutyUtils.ts เป๊ะ           */
export function pickPrimary(
	duty: Duty,
	pool: string[],
	periodIdx: number,
	used: Set<string>,
	groupOffset?: number,
): string | null {
	if (pool.length === 0) return null; // กัน % 0 = NaN
	const cache = duty.cachedPrimary;
	if (
		cache &&
		cache.periodIndex === periodIdx &&
		pool.includes(cache.empId) &&
		!used.has(cache.empId)
	) {
		return cache.empId;
	}
	// anchor: 1) คนเริ่มที่ admin เลือก (rotationStartEmpId) · 2) groupOffset
	// (0,1,2,... ประจำกลุ่ม pool = Latin square กันซ้ำเร็ว) · 3) hashDutyId เดิม
	const startIdx = duty.rotationStartEmpId
		? pool.indexOf(duty.rotationStartEmpId)
		: -1;
	const anchor =
		startIdx >= 0 ? startIdx : (groupOffset ?? hashDutyId(duty.id));
	const base = (periodIdx + anchor) % pool.length;
	for (let off = 0; off < pool.length; off++) {
		const cand = pool[(base + off) % pool.length];
		if (!used.has(cand)) return cand;
	}
	return pool[base]; // ทุกคนถูกใช้หมด → ยอมซ้ำ
}

export interface Employee {
	id: string;
	name: string;
	nickname?: string;
	avatar: string;
	avatarType: "text" | "emoji" | "image";
	avatarImageUrl: string | null;
	displayOrder?: number;
}

export interface LeaveEntry {
	employeeId: string;
	start: string;
	end: string;
}

export type DutyReason =
	| "rotation"
	| "substitute_for_leave"
	| "double_up"
	| "all_on_leave"
	| "empty_pool"
	// coverage (kind="coverage")
	| "coverage" // มีคนแทนเรียบร้อย
	| "coverage_no_candidate" // กลุ่มเป้าหมายลา แต่หาคนแทนไม่ได้
	| "empty_target_role" // กลุ่มเป้าหมายไม่มีคนเลย (admin ตั้งค่าผิด)
	| "target_present"; // ไม่มีคนในกลุ่มเป้าหมายลาวันนี้

export interface DutyAssignment {
	dutyId: string;
	dutyName: string;
	kind?: "rotation" | "coverage";
	period: "weekly" | "monthly";
	primaryEmpId: string | null;
	actualEmpId: string | null;
	/** coverage: คนในกลุ่มเป้าหมายที่ลา (คนที่ถูกแทน) */
	targetEmpId?: string | null;
	reason: DutyReason;
	/** คนหลักไม่ได้ลา แต่ "ติดหน้าที่ผูกขาด" อื่นวันนี้ → มีคนมาแทน
	 *  (UI เขียน "แทน X (ติดหน้าที่อื่น)" แทน "(ลา)") · undefined = ของเดิม */
	primaryPulledToDuty?: boolean;
	periodStart: string;
	periodEnd: string;
}

function toYMD(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

function daysBetween(startYmd: string, todayYmd: string): number {
	const a = new Date(`${startYmd}T00:00:00`);
	const b = new Date(`${todayYmd}T00:00:00`);
	return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

function monthsBetween(startYmd: string, todayYmd: string): number {
	const a = new Date(`${startYmd}T00:00:00`);
	const b = new Date(`${todayYmd}T00:00:00`);
	return (
		(b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
	);
}

export function getPeriodIndex(duty: Duty, todayYmd: string): number {
	if (duty.period === "weekly") {
		return Math.floor(daysBetween(duty.rotationStartDate, todayYmd) / 7);
	}
	return monthsBetween(duty.rotationStartDate, todayYmd);
}

export function getPeriodRange(
	duty: Duty,
	todayYmd: string,
): { start: string; end: string } {
	const idx = Math.max(0, getPeriodIndex(duty, todayYmd));
	const start = new Date(`${duty.rotationStartDate}T00:00:00`);
	if (duty.period === "weekly") {
		start.setDate(start.getDate() + idx * 7);
		const end = new Date(start);
		end.setDate(end.getDate() + 6);
		return { start: toYMD(start), end: toYMD(end) };
	}
	start.setMonth(start.getMonth() + idx);
	start.setDate(1);
	const end = new Date(start);
	end.setMonth(end.getMonth() + 1);
	end.setDate(0);
	return { start: toYMD(start), end: toYMD(end) };
}

function isOnLeave(leaves: LeaveEntry[], empId: string, ymd: string): boolean {
	return leaves.some(
		(l) => l.employeeId === empId && l.start <= ymd && l.end >= ymd,
	);
}

export function resolveDutyPool(duty: Duty, employees: Employee[]): Employee[] {
	const members = new Set(duty.memberEmpIds || []);
	return sortByDisplayOrder(employees.filter((e) => members.has(e.id)));
}

/** เรียงพนักงานตาม displayOrder (asc) → ชื่อ (fallback) — ลำดับของ pool
 *  ⚠️ ต้องเหมือน src/utils/dutyUtils.ts (check-duty-sync)                */
export function sortByDisplayOrder<T extends EmployeeOrderLite>(
	employees: T[],
): T[] {
	return [...employees].sort((a, b) => {
		const ao = typeof a.displayOrder === "number" ? a.displayOrder : null;
		const bo = typeof b.displayOrder === "number" ? b.displayOrder : null;
		if (ao !== null && bo !== null) return ao - bo;
		if (ao !== null) return -1;
		if (bo !== null) return 1;
		return (a.name || "").localeCompare(b.name || "", "th");
	});
}

interface EmployeeOrderLite {
	name?: string;
	displayOrder?: number | null;
}

function activePool(duty: Duty, employees: Employee[]): string[] {
	return resolveDutyPool(duty, employees).map((e) => e.id);
}

/** เลือกคนที่ "ถือหน้าที่วันนี้น้อยสุด" จากรายชื่อที่สแกนมาแล้ว —
 *  เสมอกันใช้ลำดับสแกนเดิม (deterministic) · load ว่าง = พฤติกรรมเดิมเป๊ะ */
function pickLeastLoaded(
	candidates: string[],
	loadToday?: Map<string, number>,
): string | null {
	if (candidates.length === 0) return null;
	if (!loadToday) return candidates[0];
	let best = candidates[0];
	let bestLoad = loadToday.get(best) ?? 0;
	for (const cand of candidates.slice(1)) {
		const load = loadToday.get(cand) ?? 0;
		if (load < bestLoad) {
			best = cand;
			bestLoad = load;
		}
	}
	return best;
}

export function computeDutyForDay(
	duty: Duty,
	todayYmd: string,
	employees: Employee[],
	leaves: LeaveEntry[],
	excludeForPrimary: Set<string>,
	primariesToday: Set<string>,
	precomputedPrimary?: string,
	// monthly: history การแทนสะสมตั้งแต่ต้นปี (จาก replayRotationSubHistory)
	// → เลือกคนแทนแบบไม่ซ้ำ · undefined = neighbor-scan เดิม (weekly)
	subHistory?: Map<string, number>,
	/** คนที่ "ติดหน้าที่ผูกขาด" วันนี้ (Duty.exclusive) — กันออกจากหน้าที่นี้
	 *  ทุกชั้น (คนหลัก · คนแทน · double-up) · แต่ยังเป็นแค่ preference:
	 *  ถ้ากันแล้วไม่มีใครทำได้เลย จะยอมดึงกลับมา (ห้ามปล่อยหน้าที่ว่าง)     */
	blockedEmpIds?: Set<string>,
	/** จำนวนหน้าที่ที่แต่ละคน "ถืออยู่แล้ววันนี้" — ใช้ตอนจำเป็นต้องให้ทำซ้อน
	 *  (double_up / ทางเลือกสุดท้าย) เลือกคนที่ถือน้อยสุดก่อน กันงานไปกอง
	 *  ที่คนเดียว · ไม่ส่ง = ทุกคนถือ 0 (พฤติกรรมเดิม: เจอใครก่อนเอาคนนั้น) */
	loadToday?: Map<string, number>,
): DutyAssignment {
	// rawPool = คนทั้งหมดของหน้าที่นี้ (ยังไม่กรองอะไร) — เก็บไว้ใช้เป็น
	// "ทางเลือกสุดท้าย" กันหน้าที่ว่างทั้งที่ยังมีคนมาทำงานวันนี้
	const rawPool = activePool(duty, employees);
	const unblocked = blockedEmpIds?.size
		? rawPool.filter((id) => !blockedEmpIds.has(id))
		: rawPool;
	const fullPool = unblocked.length > 0 ? unblocked : rawPool;
	const { start: periodStart, end: periodEnd } = getPeriodRange(duty, todayYmd);

	if (fullPool.length === 0) {
		return {
			dutyId: duty.id,
			dutyName: duty.name,
			period: duty.period,
			primaryEmpId: null,
			actualEmpId: null,
			reason: "empty_pool",
			periodStart,
			periodEnd,
		};
	}

	const preferredPool = fullPool.filter((id) => !excludeForPrimary.has(id));
	const pool = preferredPool.length > 0 ? preferredPool : fullPool;

	const idx = Math.max(0, getPeriodIndex(duty, todayYmd));
	// คนหลักที่ "ติดหน้าที่ผูกขาด" วันนี้ ไม่ได้แปลว่าเวรเปลี่ยนมือ — เขายัง
	// เป็นคนหลักของรอบนี้ แค่วันนี้มาทำไม่ได้ · ต้องคงเขาไว้เป็น primaryEmpId
	// แล้วหา "คนแทน" เหมือนตอนลา ไม่งั้นพัง 2 อย่าง:
	//  1. UI ไม่ขึ้น "แทน X" — ดูเหมือนเป็นเวรของคนแทนเอง
	//  2. rotation เลื่อน — ตัดเขาออกจาก pool ทำให้ index ของทุกคนขยับ
	//     (คนถัดไปโดนข้าม · คนหลักตัวจริงไม่เคยถูกบันทึกว่าถึงเวร)
	const blockedPrimary =
		!!precomputedPrimary &&
		!!blockedEmpIds?.has(precomputedPrimary) &&
		rawPool.includes(precomputedPrimary);
	// ใช้ primary ที่ Phase 1/2 คำนวณไว้ (cache + hash + de-collide) ถ้ายัง
	// อยู่ใน pool · ไม่งั้น compute เอง — ใช้ primariesToday เป็น used set
	// เพื่อเคารพ skip-collision แม้ใน fallback
	const primary = blockedPrimary
		? (precomputedPrimary as string)
		: precomputedPrimary && pool.includes(precomputedPrimary)
			? precomputedPrimary
			: pickPrimary(duty, pool, idx, primariesToday);
	if (!primary) {
		// pool ว่างหลัง filter ทุกชั้น (ไม่ควรถึง — fullPool guard ด้านบน)
		return {
			dutyId: duty.id,
			dutyName: duty.name,
			period: duty.period,
			primaryEmpId: null,
			actualEmpId: null,
			reason: "empty_pool",
			periodStart,
			periodEnd,
		};
	}

	// primary ไม่ลา + ไม่ติดหน้าที่ผูกขาด → ใช้ primary
	if (!blockedPrimary && !isOnLeave(leaves, primary, todayYmd)) {
		return {
			dutyId: duty.id,
			dutyName: duty.name,
			period: duty.period,
			primaryEmpId: primary,
			actualEmpId: primary,
			reason: "rotation",
			periodStart,
			periodEnd,
		};
	}

	// admin ตั้ง "ไม่ให้เป็นคนแทน" ในหน้าที่นี้ (ยังหมุนเป็นเวรหลักได้ตามปกติ)
	const subExcluded = new Set(duty.substituteExcludedEmpIds || []);

	// monthly + มี history → เลือกคนแทนแบบยุติธรรม "เคยแทนน้อยสุดก่อน"
	// (กันคนเดิมโดนเลือกซ้ำทุกครั้งที่ primary ลา — primary monthly คงที่
	// ทั้งเดือน neighbor-scan เดิมเลยได้คนเดิมตลอด)
	if (subHistory) {
		const pick = pickRotationSubstitute(
			pool,
			primary,
			todayYmd,
			leaves,
			primariesToday,
			subHistory,
			subExcluded,
		);
		// คนหลักติดหน้าที่ผูกขาด แต่ไม่มีใครแทนได้ → ให้เขาทำซ้อนเอง
		// (ผูกขาดเป็นแค่ preference · "ห้ามปล่อยหน้าที่ว่าง" สำคัญกว่า)
		const actual = pick ?? (blockedPrimary ? primary : null);
		return {
			dutyId: duty.id,
			dutyName: duty.name,
			period: duty.period,
			primaryEmpId: primary,
			actualEmpId: actual,
			reason: pick
				? primariesToday.has(pick)
					? "double_up"
					: "substitute_for_leave"
				: actual
					? "rotation"
					: "all_on_leave",
			primaryPulledToDuty: blockedPrimary && pick ? true : undefined,
			periodStart,
			periodEnd,
		};
	}

	// substitute scan เริ่มจากตำแหน่ง primary ใน pool (deterministic) ·
	// ถ้า primary ไม่อยู่ใน pool (ติดผูกขาดเลยถูกกรองออก) เริ่มที่ offset 0
	// ไม่งั้นคนแรกของ pool จะถูกข้ามฟรีๆ
	const primaryIdx = pool.indexOf(primary);
	const startIdx = Math.max(0, primaryIdx);
	const firstOffset = primaryIdx >= 0 ? 1 : 0;
	for (let offset = firstOffset; offset < pool.length; offset++) {
		const cand = pool[(startIdx + offset) % pool.length];
		if (cand === primary) continue;
		if (subExcluded.has(cand)) continue;
		if (isOnLeave(leaves, cand, todayYmd)) continue;
		if (primariesToday.has(cand)) continue;
		return {
			dutyId: duty.id,
			dutyName: duty.name,
			period: duty.period,
			primaryEmpId: primary,
			actualEmpId: cand,
			reason: "substitute_for_leave",
			primaryPulledToDuty: blockedPrimary || undefined,
			periodStart,
			periodEnd,
		};
	}

	const doubleUpCands: string[] = [];
	for (let offset = firstOffset; offset < pool.length; offset++) {
		const cand = pool[(startIdx + offset) % pool.length];
		if (cand === primary) continue;
		if (subExcluded.has(cand)) continue;
		if (isOnLeave(leaves, cand, todayYmd)) continue;
		doubleUpCands.push(cand);
	}
	const doubleUp = pickLeastLoaded(doubleUpCands, loadToday);
	if (doubleUp) {
		return {
			dutyId: duty.id,
			dutyName: duty.name,
			period: duty.period,
			primaryEmpId: primary,
			actualEmpId: doubleUp,
			reason: "double_up",
			primaryPulledToDuty: blockedPrimary || undefined,
			periodStart,
			periodEnd,
		};
	}

	// ทางเลือกสุดท้าย — ห้ามปล่อยหน้าที่ว่างถ้ายังมีคนมาทำงานวันนี้
	// ปลดทั้ง excludeForPrimary (คนหลักรายเดือน) และ blockedEmpIds (คนผูกขาด)
	// แล้วมองจาก rawPool · ยังเคารพ subExcluded + ข้ามคนที่ลาจริง
	const rawStartIdx = Math.max(0, rawPool.indexOf(primary));
	const lastResortCands: string[] = [];
	for (let offset = 1; offset <= rawPool.length; offset++) {
		const cand = rawPool[(rawStartIdx + offset) % rawPool.length];
		if (cand === primary) continue;
		if (subExcluded.has(cand)) continue;
		if (isOnLeave(leaves, cand, todayYmd)) continue;
		if (!lastResortCands.includes(cand)) lastResortCands.push(cand);
	}
	const lastResort = pickLeastLoaded(lastResortCands, loadToday);
	if (lastResort) {
		return {
			dutyId: duty.id,
			dutyName: duty.name,
			period: duty.period,
			primaryEmpId: primary,
			actualEmpId: lastResort,
			reason: "double_up",
			primaryPulledToDuty: blockedPrimary || undefined,
			periodStart,
			periodEnd,
		};
	}

	// คนหลักติดหน้าที่ผูกขาด แต่ไม่มีใครมาแทนได้เลย → ให้เขาทำซ้อนเอง
	// (ผูกขาดเป็นแค่ preference · "ห้ามปล่อยหน้าที่ว่าง" สำคัญกว่า)
	if (blockedPrimary) {
		return {
			dutyId: duty.id,
			dutyName: duty.name,
			period: duty.period,
			primaryEmpId: primary,
			actualEmpId: primary,
			reason: "rotation",
			periodStart,
			periodEnd,
		};
	}

	// ทุกคนของหน้าที่นี้ลาหมดจริงๆ
	return {
		dutyId: duty.id,
		dutyName: duty.name,
		period: duty.period,
		primaryEmpId: primary,
		actualEmpId: null,
		reason: "all_on_leave",
		periodStart,
		periodEnd,
	};
}

/* ─── Coverage (เวรแทนคนลาของกลุ่มเป้าหมาย) ───────────────────────
   เลือกคนแทนจาก candidateEmpIds ที่ "เคยแทนน้อยสุด" (ยุติธรรม) →
   tie-break ด้วย displayOrder · ข้ามคนที่ลา/ถูกใช้ไปแล้ววันนั้น
   coverageHistory = empId → จำนวนครั้งที่เคยแทนสะสม (จาก replay)
   monthlyPrimaries = คนที่ทำหน้าที่ประจำเดือนในวันนี้ → ไม่เอามาแทน    */
function pickCoverageCandidate(
	duty: Duty,
	todayYmd: string,
	employees: Employee[],
	leaves: LeaveEntry[],
	history: Map<string, number>,
	usedToday: Set<string>,
	monthlyPrimaries: Set<string>,
): string | null {
	const byId = new Map(employees.map((e) => [e.id, e]));
	const eligible = (duty.candidateEmpIds || [])
		.map((id) => byId.get(id))
		.filter(
			(e): e is Employee =>
				!!e &&
				!usedToday.has(e.id) &&
				!monthlyPrimaries.has(e.id) &&
				!isOnLeave(leaves, e.id, todayYmd),
		)
		.sort((a, b) => {
			const ca = history.get(a.id) || 0;
			const cb = history.get(b.id) || 0;
			if (ca !== cb) return ca - cb; // เคยแทนน้อยสุดก่อน
			const ao = typeof a.displayOrder === "number" ? a.displayOrder : 1e9;
			const bo = typeof b.displayOrder === "number" ? b.displayOrder : 1e9;
			if (ao !== bo) return ao - bo;
			return (a.name || "").localeCompare(b.name || "", "th");
		});
	return eligible.length > 0 ? eligible[0].id : null;
}

/** คนในกลุ่มเป้าหมายที่ลาวันนี้ (ต้องหาคนแทน) เรียงตาม displayOrder */
function absentTargets(
	duty: Duty,
	todayYmd: string,
	employees: Employee[],
	leaves: LeaveEntry[],
): string[] {
	const targets = new Set(duty.coverageTargetEmpIds || []);
	return employees
		.filter((e) => targets.has(e.id) && isOnLeave(leaves, e.id, todayYmd))
		.sort(
			(a, b) =>
				(typeof a.displayOrder === "number" ? a.displayOrder : 1e9) -
				(typeof b.displayOrder === "number" ? b.displayOrder : 1e9),
		)
		.map((e) => e.id);
}

/** monthly primaries ของวันใดๆ — ใช้ assignPrimaries ตัวเดียวกับ
 *  computeAllDutiesForDay (cache + hash + de-collide) เพื่อให้ผลตรงกัน
 *  ⚠️ ต้องเหมือน src/utils/dutyUtils.ts เป๊ะ                              */
export function monthlyPrimariesForDay(
	monthlyDuties: Duty[],
	todayYmd: string,
	employees: Employee[],
): Set<string> {
	if (monthlyDuties.length === 0) return new Set();
	const assigned = new Set<string>();
	const locked = new Set<string>();
	const out = new Map<string, string>();
	assignPrimaries(
		monthlyDuties,
		todayYmd,
		(d) => activePool(d, employees),
		assigned,
		locked,
		true,
		out,
	);
	return new Set(out.values());
}

/** Replay coverage ทั้งช่วง [startYmd, endYmd) เพื่อนับว่าใครแทนไปกี่ครั้ง
 *  (ใช้สร้าง history สำหรับเลือกคนที่ยุติธรรมในวันนี้)
 *  monthlyDuties ส่งเข้าไปเพื่อ exclude คนที่ทำหน้าที่ประจำเดือนของแต่ละวัน
 *  (replay ต้องคำนวณ monthly primaries ของแต่ละวัน เพราะอาจเปลี่ยนทุกเดือน)  */
export function replayCoverageHistory(
	coverageDuties: Duty[],
	monthlyDuties: Duty[],
	employees: Employee[],
	allLeaves: LeaveEntry[],
	startYmd: string,
	endYmd: string,
	// ปฏิทินร้าน — วันร้านปิดไม่มีคนแทน → ไม่นับเข้า fairness history
	calendar?: StoreCalendarLite | null,
): Map<string, number> {
	const history = new Map<string, number>();
	if (coverageDuties.length === 0) return history;
	const start = new Date(`${startYmd}T00:00:00`);
	const end = new Date(`${endYmd}T00:00:00`);
	// memoize ตามเดือน — monthly period ขึ้นกับเดือน ไม่ขึ้นกับวัน
	// → ~12 ครั้ง/ปี แทน ~365 ครั้ง (×assignPrimaries ทุกครั้ง)
	const monthlyPrimariesCache = new Map<string, Set<string>>();
	for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
		const ymd = toYMD(d);
		const ym = ymd.slice(0, 7);
		let monthlyPrimaries = monthlyPrimariesCache.get(ym);
		if (!monthlyPrimaries) {
			monthlyPrimaries = monthlyPrimariesForDay(monthlyDuties, ymd, employees);
			monthlyPrimariesCache.set(ym, monthlyPrimaries);
		}
		const usedToday = new Set<string>();
		for (const duty of coverageDuties) {
			// ร้านปิดวันนั้น → ไม่มีคนแทน → ไม่นับเข้า history
			if (applicableDuties([duty], ymd, calendar).length === 0) continue;
			for (const _t of absentTargets(duty, ymd, employees, allLeaves)) {
				const pick = pickCoverageCandidate(
					duty,
					ymd,
					employees,
					allLeaves,
					history,
					usedToday,
					monthlyPrimaries,
				);
				if (pick) {
					usedToday.add(pick);
					history.set(pick, (history.get(pick) || 0) + 1);
				}
			}
		}
	}
	return history;
}

/* ─── คนแทนหน้าที่ประจำเดือน (rotation·monthly) — แบบไม่ซ้ำ ──────────
   Mirror ของ src/utils/dutyUtils.ts (check-duty-sync ตรวจ 2 ฟังก์ชันนี้)
   เดิม substitute = คนถัดจาก primary เสมอ → โดนซ้ำทุกครั้งที่ primary ลา
   → เลือกแบบ "เคยแทนน้อยสุดก่อน" (history replay ตั้งแต่ต้นปี)             */

/** เลือกคนแทน 1 วัน แบบ history-fair — pass 1 ข้ามคนลา+คนติดหน้าที่อื่น ·
 *  pass 2 double-up (ข้ามแค่คนลา) · คืน null เมื่อทุกคนลา
 *  subExcluded = คนที่ admin ตั้งว่า "ไม่ให้เป็นคนแทน" ในหน้าที่นี้ (ข้ามทั้ง
 *  2 pass · ยังหมุนเป็นเวรหลักได้ตามปกติ)
 *  ⚠️ ต้องเหมือน src/utils/dutyUtils.ts เป๊ะ (check-duty-sync)            */
export function pickRotationSubstitute(
	pool: string[],
	primary: string,
	ymd: string,
	leaves: LeaveEntry[],
	busy: Set<string>,
	history: Map<string, number>,
	subExcluded: Set<string>,
): string | null {
	const startIdx = Math.max(0, pool.indexOf(primary));
	const len = pool.length;
	const cands = pool
		.filter((id) => id !== primary && !subExcluded.has(id))
		.sort((a, b) => {
			const ha = history.get(a) || 0;
			const hb = history.get(b) || 0;
			if (ha !== hb) return ha - hb;
			const da = (pool.indexOf(a) - startIdx + len) % len;
			const db = (pool.indexOf(b) - startIdx + len) % len;
			return da - db;
		});
	for (const cand of cands) {
		if (isOnLeave(leaves, cand, ymd)) continue;
		if (busy.has(cand)) continue;
		return cand;
	}
	for (const cand of cands) {
		if (isOnLeave(leaves, cand, ymd)) continue;
		return cand;
	}
	return null;
}

/** Replay การแทน (rotation) ตั้งแต่ fromYmd → ก่อน toYmdExclusive — weekly+monthly
 *  นับว่าใครแทนไปกี่ครั้ง (seed ให้เลือกคนแทนแบบไม่ซ้ำต่อเนื่องกับที่ผ่านมา)
 *  ⚠️ ต้องเหมือน src/utils/dutyUtils.ts เป๊ะ (check-duty-sync)            */
export function replayRotationSubHistory(
	duty: Duty,
	pool: string[],
	allLeaves: LeaveEntry[],
	calendar: StoreCalendarLite | null | undefined,
	fromYmd: string,
	toYmdExclusive: string,
): Map<string, number> {
	const history = new Map<string, number>();
	if (pool.length === 0) return history;
	const subExcluded = new Set(duty.substituteExcludedEmpIds || []);
	// primary ต่อ "รอบ" (period index) — weekly=สัปดาห์ · monthly=เดือน
	const primaryByPeriod = new Map<number, string | null>();
	const end = new Date(`${toYmdExclusive}T00:00:00`);
	for (
		let d = new Date(`${fromYmd}T00:00:00`);
		d < end;
		d.setDate(d.getDate() + 1)
	) {
		const ymd = toYMD(d);
		if (applicableDuties([duty], ymd, calendar).length === 0) continue;
		const idx = Math.max(0, getPeriodIndex(duty, ymd));
		let primary = primaryByPeriod.get(idx);
		if (primary === undefined) {
			primary = pickPrimary(duty, pool, idx, new Set());
			primaryByPeriod.set(idx, primary);
		}
		if (!primary || !isOnLeave(allLeaves, primary, ymd)) continue;
		const pick = pickRotationSubstitute(
			pool,
			primary,
			ymd,
			allLeaves,
			new Set(),
			history,
			subExcluded,
		);
		if (pick) history.set(pick, (history.get(pick) || 0) + 1);
	}
	return history;
}

/* ─── Coverage forecast (คนแทนกลุ่มเป้าหมายล่วงหน้า) ───────────────
   Mirror ของ src/utils/dutyUtils.ts → computeCoverageForecast · ใช้ helper
   ชุดเดียวกับ coverage จริง (pickCoverageCandidate / monthlyPrimariesForDay /
   absentTargets) → forecast ตรงกับที่มอบหมายจริง · replay ตั้งแต่ต้นปี
   (seed history ให้ยุติธรรม) แล้วบันทึกผลเฉพาะ >= today · จับวันต่อเนื่องที่
   คนแทนคนเดิมเป็นช่วงเดียว                                                       */
export interface CoverageForecastEntry {
	dutyId: string;
	dutyName: string;
	start: string; // YYYY-MM-DD (inclusive)
	end: string; // YYYY-MM-DD (inclusive)
	targetEmpId: string;
	substituteEmpId: string | null;
}

/** วันถัดไป (YYYY-MM-DD +1) — parse local-date เลี่ยง TZ */
function nextYmd(ymd: string): string {
	const d = new Date(`${ymd}T00:00:00`);
	d.setDate(d.getDate() + 1);
	return toYMD(d);
}

export function computeCoverageForecast(
	duties: Duty[],
	employees: Employee[],
	allLeaves: LeaveEntry[],
	todayYmd: string,
	endYmd: string,
	// ปฏิทินร้าน — วันร้านปิด (เสาร์ default / admin mark) ไม่มีคนแทน (ไม่ forecast)
	calendar?: StoreCalendarLite | null,
): CoverageForecastEntry[] {
	const coverageDuties = duties.filter((d) => d.kind === "coverage");
	if (coverageDuties.length === 0 || todayYmd > endYmd) return [];
	const monthlyDuties = duties.filter(
		(d) => d.kind !== "coverage" && d.period === "monthly",
	);
	const dutyNameById = new Map(coverageDuties.map((d) => [d.id, d.name]));

	const yearStart = `${todayYmd.slice(0, 4)}-01-01`;
	const replayStart = yearStart < todayYmd ? yearStart : todayYmd;
	const history = new Map<string, number>();
	const monthlyPrimariesCache = new Map<string, Set<string>>();
	const picks: {
		dutyId: string;
		ymd: string;
		targetEmpId: string;
		substituteEmpId: string | null;
	}[] = [];
	const endD = new Date(`${endYmd}T00:00:00`);
	for (
		let d = new Date(`${replayStart}T00:00:00`);
		d <= endD;
		d.setDate(d.getDate() + 1)
	) {
		const ymd = toYMD(d);
		const ym = ymd.slice(0, 7);
		let monthlyPrimaries = monthlyPrimariesCache.get(ym);
		if (!monthlyPrimaries) {
			monthlyPrimaries = monthlyPrimariesForDay(monthlyDuties, ymd, employees);
			monthlyPrimariesCache.set(ym, monthlyPrimaries);
		}
		const usedToday = new Set<string>();
		const record = ymd >= todayYmd;
		for (const duty of coverageDuties) {
			// ร้านปิดวันนั้น → ไม่มีคนแทน (ให้ตรงกับ count/pay ที่ gate แล้ว)
			if (applicableDuties([duty], ymd, calendar).length === 0) continue;
			for (const targetId of absentTargets(duty, ymd, employees, allLeaves)) {
				const pick = pickCoverageCandidate(
					duty,
					ymd,
					employees,
					allLeaves,
					history,
					usedToday,
					monthlyPrimaries,
				);
				if (pick) {
					usedToday.add(pick);
					history.set(pick, (history.get(pick) || 0) + 1);
				}
				if (record) {
					picks.push({
						dutyId: duty.id,
						ymd,
						targetEmpId: targetId,
						substituteEmpId: pick,
					});
				}
			}
		}
	}

	picks.sort(
		(a, b) =>
			a.dutyId.localeCompare(b.dutyId) ||
			a.targetEmpId.localeCompare(b.targetEmpId) ||
			a.ymd.localeCompare(b.ymd),
	);
	const out: CoverageForecastEntry[] = [];
	for (const p of picks) {
		const last = out[out.length - 1];
		if (
			last &&
			last.dutyId === p.dutyId &&
			last.targetEmpId === p.targetEmpId &&
			last.substituteEmpId === p.substituteEmpId &&
			nextYmd(last.end) === p.ymd
		) {
			last.end = p.ymd;
		} else {
			out.push({
				dutyId: p.dutyId,
				dutyName: dutyNameById.get(p.dutyId) || "",
				start: p.ymd,
				end: p.ymd,
				targetEmpId: p.targetEmpId,
				substituteEmpId: p.substituteEmpId,
			});
		}
	}
	out.sort(
		(a, b) =>
			a.start.localeCompare(b.start) ||
			a.dutyName.localeCompare(b.dutyName, "th"),
	);
	return out;
}

/** คำนวณ coverage ของวันนี้ + คืน set คนที่ถูกดึงไปแทน (เพื่อให้ rotation
 *  ปล่อย slot weekly ของเขาแล้วหาเพื่อนร่วมงานแทน — cascade)                    */
function computeCoverageForDay(
	coverageDuties: Duty[],
	todayYmd: string,
	employees: Employee[],
	leaves: LeaveEntry[],
	history: Map<string, number>,
	monthlyPrimaries: Set<string>,
): { assignments: DutyAssignment[]; pulled: Set<string> } {
	const assignments: DutyAssignment[] = [];
	const pulled = new Set<string>();
	const usedToday = new Set<string>();
	for (const duty of coverageDuties) {
		// แยกเคส: กลุ่มเป้าหมายไม่มีคนเลย (admin ตั้งค่าผิด) vs ทุกคนมาทำงานปกติ
		const targetIds = new Set(duty.coverageTargetEmpIds || []);
		const hasAnyTarget = employees.some((e) => targetIds.has(e.id));
		const targets = absentTargets(duty, todayYmd, employees, leaves);
		if (targets.length === 0) {
			assignments.push({
				dutyId: duty.id,
				dutyName: duty.name,
				kind: "coverage",
				period: "weekly",
				primaryEmpId: null,
				actualEmpId: null,
				targetEmpId: null,
				reason: hasAnyTarget ? "target_present" : "empty_target_role",
				periodStart: todayYmd,
				periodEnd: todayYmd,
			});
			continue;
		}
		for (const targetId of targets) {
			const pick = pickCoverageCandidate(
				duty,
				todayYmd,
				employees,
				leaves,
				history,
				usedToday,
				monthlyPrimaries,
			);
			if (pick) {
				usedToday.add(pick);
				pulled.add(pick);
			}
			assignments.push({
				dutyId: duty.id,
				dutyName: duty.name,
				kind: "coverage",
				period: "weekly",
				primaryEmpId: null,
				actualEmpId: pick,
				targetEmpId: targetId,
				reason: pick ? "coverage" : "coverage_no_candidate",
				periodStart: todayYmd,
				periodEnd: todayYmd,
			});
			// บันทึกเพื่อให้วันถัดไปยุติธรรม (ในการ replay จะนับเองอยู่แล้ว
			// แต่กรณีหลายเป้าหมายวันเดียว เพิ่ม count ทันทีกันเลือกซ้ำคนเดิม)
			if (pick) history.set(pick, (history.get(pick) || 0) + 1);
		}
	}
	return { assignments, pulled };
}

export function computeAllDutiesForDay(
	duties: Duty[],
	todayYmd: string,
	employees: Employee[],
	leaves: LeaveEntry[],
	coverageHistory?: Map<string, number>,
	calendar?: StoreCalendarLite | null,
	// dutyId → history การแทน (monthly rotation) จาก replayRotationSubHistory
	rotationSubHistory?: Map<string, Map<string, number>>,
): DutyAssignment[] {
	// ร้านปิด → ไม่มี assignment เลย · อาทิตย์ → ตัด weekly+skipSundays
	const todayDuties = applicableDuties(duties, todayYmd, calendar);
	// แยก coverage ออกจาก rotation
	const coverageDuties = todayDuties.filter((d) => d.kind === "coverage");
	const rotationDuties = todayDuties.filter((d) => d.kind !== "coverage");
	const monthlyDuties = rotationDuties.filter((d) => d.period === "monthly");

	// คำนวณ monthly primaries ก่อน — กันคนที่ทำหน้าที่ประจำเดือนไม่ให้
	// ถูกเลือกเป็นคนแทน coverage (เจ้าตัวควรอยู่กับ monthly duty ของตัวเอง)
	const monthlyPrimaries = monthlyPrimariesForDay(
		monthlyDuties,
		todayYmd,
		employees,
	);

	// 1) coverage ก่อน — รู้ว่าใครถูกดึงไปแทนบัญชี
	const { assignments: coverageAssignments, pulled } = computeCoverageForDay(
		coverageDuties,
		todayYmd,
		employees,
		leaves,
		coverageHistory ?? new Map<string, number>(),
		monthlyPrimaries,
	);

	// 2) คนที่ถูกดึงไปแทน → ถือว่า "ไม่ว่าง" สำหรับ weekly/monthly ของตัวเอง
	//    (cascade: weekly ของเขาจะหาเพื่อนร่วมงานแทนผ่าน substitute logic เดิม)
	const effLeaves =
		pulled.size > 0
			? [
					...leaves,
					...[...pulled].map((id) => ({
						employeeId: id,
						start: todayYmd,
						end: todayYmd,
					})),
				]
			: leaves;

	const rotationAssignments = computeRotationForDay(
		rotationDuties,
		todayYmd,
		employees,
		effLeaves,
		rotationSubHistory,
		// assign คนหลักจากรายการเต็ม (ก่อน filter ปฏิทิน) → วันอาทิตย์ที่หน้าที่
		// skipSundays หายไป คนหลักของหน้าที่อื่นไม่เลื่อนตาม (ตรงกับปฏิทินหน้าที่)
		duties.filter((d) => d.kind !== "coverage"),
	);

	// ห้ามมีหน้าที่ว่างทั้งที่ยังมีคนมาทำงาน — คนที่ถูกดึงไปแทน (coverage)
	// ถูกกันออกจากหน้าที่หมุนเวียนทุกชั้นผ่าน effLeaves (หน้าที่ "แทนคนลา"
	// ผูกขาดคนทำเสมอ) · ถ้ากันแล้วเหลือหน้าที่ว่างทั้งที่เขามาทำงานจริง →
	// ดึงกลับมาทำ (กฎเดียวกับหน้าที่ผูกขาด: ว่างไม่ได้ · เลือกคนถือน้อยสุด)
	fillEmptyWithPulled(
		rotationAssignments,
		rotationDuties,
		pulled,
		todayYmd,
		employees,
		leaves,
		coverageAssignments,
	);

	// คนที่ถูกดึงไปแทน (coverage) ถูกใส่ใน effLeaves เพื่อให้ cascade ทำงาน —
	// แต่เขา "ไม่ได้ลา" จริง · ติดป้ายไว้ให้ UI เขียน "แทน X (ติดหน้าที่อื่น)"
	// แทน "(ลา)" ที่ชวนเข้าใจผิดว่าเจ้าตัวหยุด
	for (const a of rotationAssignments) {
		if (
			a.primaryEmpId &&
			a.actualEmpId !== a.primaryEmpId &&
			pulled.has(a.primaryEmpId) &&
			!isOnLeave(leaves, a.primaryEmpId, todayYmd)
		) {
			a.primaryPulledToDuty = true;
		}
	}

	// preserve ลำดับ duties เดิม + coverage ตามตำแหน่งของมัน
	const byId = new Map<string, DutyAssignment[]>();
	for (const a of rotationAssignments)
		byId.set(a.dutyId, [...(byId.get(a.dutyId) || []), a]);
	for (const a of coverageAssignments)
		byId.set(a.dutyId, [...(byId.get(a.dutyId) || []), a]);
	const out: DutyAssignment[] = [];
	// ใช้ todayDuties (หลัง filter Sunday-off) เพื่อไม่ให้หน้าที่ที่ถูกข้าม
	// โผล่ใน output เพราะอยู่ใน outer duties array
	for (const duty of todayDuties) {
		const list = byId.get(duty.id);
		if (list) out.push(...list);
	}
	return out;
}

/** ทางเลือกสุดท้ายของหน้าที่หมุนเวียนที่ "ว่าง" (all_on_leave) — ดึงคนที่ถูก
 *  ส่งไปแทน coverage วันนั้นกลับมาทำ เมื่อไม่มีใครอื่นเหลือแล้ว
 *  · เคารพ substituteExcludedEmpIds + ใบลาจริงเสมอ (ไม่ใช่ effLeaves)
 *  · เลือกคนที่ถือหน้าที่วันนี้น้อยสุด (นับรวม coverage) กันงานกองที่คนเดียว
 *  · แก้ assignment ที่ส่งเข้ามาโดยตรง (in-place)                          */
function fillEmptyWithPulled(
	rotationAssignments: DutyAssignment[],
	rotationDuties: Duty[],
	pulled: Set<string>,
	todayYmd: string,
	employees: Employee[],
	leaves: LeaveEntry[],
	coverageAssignments: DutyAssignment[],
): void {
	if (pulled.size === 0) return;
	const empty = rotationAssignments.filter(
		(a) => !a.actualEmpId && a.reason === "all_on_leave",
	);
	if (empty.length === 0) return;
	const dutyById = new Map(rotationDuties.map((d) => [d.id, d]));
	// งานที่แต่ละคนถืออยู่แล้ววันนี้ (coverage + rotation ที่จัดไปแล้ว)
	const loadToday = new Map<string, number>();
	for (const a of [...coverageAssignments, ...rotationAssignments]) {
		if (a.actualEmpId)
			loadToday.set(a.actualEmpId, (loadToday.get(a.actualEmpId) ?? 0) + 1);
	}
	for (const a of empty) {
		const duty = dutyById.get(a.dutyId);
		if (!duty) continue;
		const subExcluded = new Set(duty.substituteExcludedEmpIds || []);
		const candidates = activePool(duty, employees).filter(
			(id) =>
				pulled.has(id) &&
				!subExcluded.has(id) &&
				!isOnLeave(leaves, id, todayYmd),
		);
		const pick = pickLeastLoaded(candidates, loadToday);
		if (!pick) continue;
		a.actualEmpId = pick;
		a.reason = "double_up";
		loadToday.set(pick, (loadToday.get(pick) ?? 0) + 1);
	}
}

/** assign primary ให้หน้าที่กลุ่มหนึ่ง — ลูปเดียวใช้ทั้ง monthly (lockPicked)
 *  และ weekly · ⚠️ ต้องตรงกับ src/utils/dutyUtils.ts เป๊ะ                  */
function assignPrimaries(
	duties: Duty[],
	todayYmd: string,
	poolOf: (duty: Duty) => string[],
	assigned: Set<string>,
	locked: Set<string>,
	lockPicked: boolean,
	out: Map<string, string>,
): void {
	// groupSeq: pool signature → offset เรียง 0,1,2,... ให้หน้าที่ weekly pool
	// เดียวกัน base ไม่ชนกัน (Latin square) · monthly คง hashDutyId เดิม
	const groupSeq = new Map<string, number>();
	for (const duty of duties) {
		const fullPool = poolOf(duty);
		if (fullPool.length === 0) continue;
		const remaining = fullPool.filter((id) => !locked.has(id));
		const pool = remaining.length > 0 ? remaining : fullPool;
		let groupOffset: number | undefined;
		if (duty.period === "weekly") {
			const key = pool.join(",");
			groupOffset = groupSeq.get(key) ?? 0;
			groupSeq.set(key, groupOffset + 1);
		}
		const idx = Math.max(0, getPeriodIndex(duty, todayYmd));
		const primary = pickPrimary(duty, pool, idx, assigned, groupOffset);
		if (!primary) continue;
		assigned.add(primary);
		if (lockPicked) locked.add(primary);
		out.set(duty.id, primary);
	}
}

function computeRotationForDay(
	duties: Duty[],
	todayYmd: string,
	employees: Employee[],
	leaves: LeaveEntry[],
	rotationSubHistory?: Map<string, Map<string, number>>,
	// รายการหน้าที่หมุนเวียน "ทั้งหมด" (ก่อน filter ปฏิทินรายวัน) — ใช้ assign
	// คนหลักเท่านั้น · ไม่ส่ง = ใช้ duties (พฤติกรรมเดิม)
	allRotationDuties?: Duty[],
): DutyAssignment[] {
	// ⚠️ คนหลักคิดจากรายการเต็มเสมอ — groupOffset (Latin square) + skip-collision
	// ขึ้นกับลำดับหน้าที่ใน array ถ้าใช้เฉพาะหน้าที่ที่ทำวันนั้น หน้าที่
	// weekly+skipSundays ที่หายไปวันอาทิตย์จะทำให้ offset ของหน้าที่ที่เหลือ
	// เลื่อนทั้งแถว → คนหลักเปลี่ยนคนกลางสัปดาห์ + ไม่ตรงกับปฏิทินหน้าที่
	const primarySource = allRotationDuties ?? duties;
	const monthlyDuties = primarySource.filter((d) => d.period === "monthly");
	const weeklyDuties = primarySource.filter((d) => d.period === "weekly");

	// assigned = คนที่เป็น primary แล้วรอบนี้ (pickPrimary skip-collision)
	const assigned = new Set<string>();
	const lockedByMonthly = new Set<string>();
	const primaryByDuty = new Map<string, string>();
	const poolOf = (duty: Duty) => activePool(duty, employees);

	assignPrimaries(
		monthlyDuties,
		todayYmd,
		poolOf,
		assigned,
		lockedByMonthly,
		true,
		primaryByDuty,
	);
	assignPrimaries(
		weeklyDuties,
		todayYmd,
		poolOf,
		assigned,
		lockedByMonthly,
		false,
		primaryByDuty,
	);

	const primariesToday = new Set<string>(primaryByDuty.values());

	// ⚠️ แบ่ง 2 รอบเพราะหน้าที่ "ผูกขาด" (Duty.exclusive) ต้องรู้ผลก่อน:
	// 1) คำนวณหน้าที่ผูกขาด → ได้ "คนที่ทำจริง" (คนหลัก **หรือคนแทน**)
	// 2) หน้าที่ที่เหลือคำนวณโดยตัดคนเหล่านั้นออกจาก pool → งานที่เคยตกเป็น
	//    ของเขากระจายไปให้คนอื่น
	// ต้องเหมือน src/utils/dutyUtils.ts (computeAllDutiesForDay) เชิงพฤติกรรม
	const exclusiveWorkers = new Set<string>();
	const resultByDutyId = new Map<string, DutyAssignment>();
	// งานที่แต่ละคนถืออยู่แล้ววันนี้ — ใช้ตอนจำเป็นต้องให้ทำซ้อน จะได้เลือก
	// คนที่ถือน้อยสุด แทนที่จะเทให้คนแรกที่เจอ
	const loadToday = new Map<string, number>();
	const runDuty = (duty: Duty, blocked?: Set<string>) =>
		computeDutyForDay(
			duty,
			todayYmd,
			employees,
			leaves,
			duty.period === "monthly" ? new Set<string>() : lockedByMonthly,
			primariesToday,
			primaryByDuty.get(duty.id),
			// weekly + monthly ใช้ fair-pick "เคยแทนน้อยสุดก่อน" · weekly เลือก
			// จาก preferredPool (กันคนหลักรายเดือน ผ่าน excludeForPrimary=lockedByMonthly)
			rotationSubHistory?.get(duty.id),
			blocked,
			loadToday,
		);
	const record = (duty: Duty, assignment: DutyAssignment) => {
		resultByDutyId.set(duty.id, assignment);
		if (assignment.actualEmpId) {
			loadToday.set(
				assignment.actualEmpId,
				(loadToday.get(assignment.actualEmpId) ?? 0) + 1,
			);
		}
	};

	for (const duty of duties.filter((d) => d.exclusive)) {
		const assignment = runDuty(duty, new Set(exclusiveWorkers));
		record(duty, assignment);
		if (assignment.actualEmpId) exclusiveWorkers.add(assignment.actualEmpId);
	}
	for (const duty of duties.filter((d) => !d.exclusive)) {
		record(duty, runDuty(duty, exclusiveWorkers));
	}

	return duties.map((duty) => resultByDutyId.get(duty.id) as DutyAssignment);
}
