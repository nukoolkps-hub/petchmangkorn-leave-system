import { getAuth } from "firebase-admin/auth";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { getAppFirestore } from "../../helpers/config.js";
import type { LineConfig } from "../../types.js";
import { isAuthorizedLineAdmin } from "../core/admin.js";
import {
	cleanMentionText,
	getMentionees,
	getMentionText,
	isAddressedToBot,
	normalizeSpaces,
	removeMentionRanges,
} from "../core/message.js";
import { replyText } from "../core/reply.js";
import {
	invalid,
	type LineCommand,
	type LineEvent,
	matched,
	notMatched,
} from "../core/types.js";

const SETUP_EMPLOYEE_USAGE =
	"กรุณาใช้รูปแบบ @บอท เชื่อมพนักงาน @พนักงาน หรือ @บอท เชื่อมพนักงาน @พนักงาน ชื่อพนักงาน และแท็กพนักงานจริงในกลุ่ม";

interface SetupCommand {
	targetLineUserId: string;
	targetMentionText: string;
	employeeKey: string;
	/** admin พิมพ์ชื่อพนักงานต่อท้ายเอง (ไม่ได้ใช้ชื่อ LINE ของคนที่แท็ก) */
	hasExplicitName: boolean;
}

interface EmployeeRecord {
	id: string;
	name: string;
	nickname?: string;
	lineUserId?: string;
}

type EmployeeLookupResult =
	| { status: "found"; employee: EmployeeRecord }
	| { status: "not-found" }
	| { status: "ambiguous"; employees: EmployeeRecord[] };

export const setupEmployeeCommand: LineCommand<SetupCommand> = {
	name: "เชื่อมพนักงาน",
	parse({ event }) {
		const setupCommand = parseSetupEmployeeCommand(event);
		if (setupCommand) return matched(setupCommand);

		const text = event.message?.text;
		if (text && hasSetupEmployeePhrase(text) && isAddressedToBot(event)) {
			return invalid(SETUP_EMPLOYEE_USAGE);
		}

		return notMatched();
	},
	async handle({ config, event, signatureOk }, setupCommand) {
		await handleSetupEmployeeCommand({
			config,
			event,
			setupCommand,
			signatureOk,
		});
	},
};

async function handleSetupEmployeeCommand({
	config,
	event,
	setupCommand,
	signatureOk,
}: {
	config: LineConfig;
	event: LineEvent;
	setupCommand: SetupCommand;
	signatureOk: boolean;
}): Promise<void> {
	if (!signatureOk) {
		await replyText(
			config,
			event.replyToken,
			"ยังไม่ได้ตั้งค่า LINE_CHANNEL_SECRET จึงไม่สามารถใช้คำสั่ง เชื่อมพนักงาน ได้",
		);
		return;
	}

	const senderLineUserId = event.source?.userId;
	if (!senderLineUserId) {
		await replyText(config, event.replyToken, "ไม่พบ LINE user ID ของผู้ส่งคำสั่ง");
		return;
	}

	const admin = await isAuthorizedLineAdmin(senderLineUserId, config);
	if (!admin) {
		await replyText(config, event.replyToken, "คำสั่งนี้ใช้ได้เฉพาะผู้ดูแลระบบเท่านั้น");
		return;
	}

	const db = getAppFirestore();
	const existingLinkedEmployee = await findEmployeeByLineUserId(
		db,
		setupCommand.targetLineUserId,
	);
	// แท็กอย่างเดียว → ตัดสินจาก LINE ID ล้วน ไม่เอาชื่อ LINE ไปเดา
	//   (ชื่อ LINE ที่คล้ายชื่อในระบบ เช่น "Mint" กับ "M-I-N-T🍒" อาจเป็นคนละคน)
	//   LINE ID ผูกแล้ว → บอกว่าผูกกับใคร · ยังไม่ผูก → เพิ่มพนักงานใหม่
	// ผูกกับพนักงานเดิมที่ยังไม่มี LINE → admin ต้องพิมพ์ชื่อต่อท้ายเอง
	const employeeResult: EmployeeLookupResult = setupCommand.hasExplicitName
		? await findEmployeeByKey(db, setupCommand.employeeKey)
		: { status: "not-found" };

	if (employeeResult.status === "not-found") {
		if (existingLinkedEmployee) {
			await replyText(
				config,
				event.replyToken,
				`LINE account นี้ถูกเชื่อมกับ ${existingLinkedEmployee.name} แล้ว`,
			);
			return;
		}

		await ensureLineAuthUser(
			setupCommand.targetLineUserId,
			setupCommand.employeeKey,
		);

		// C · Auto-anchor — ตอนสร้างพนักงานใหม่ ให้ต่อท้ายลำดับ (max+1)
		//   เพื่อไม่แทรกกลางลำดับที่ admin จัดไว้
		// ⚠️ การเรียงพนักงานให้คน "มี displayOrder" มาก่อนคน "ไม่มี" ดังนั้น
		//   ตั้ง displayOrder เฉพาะเมื่อพนักงานเดิม "ทุกคน" มี displayOrder แล้ว
		//   (admin เคยลากเรียง) — ไม่งั้นคนใหม่ที่ได้เลขจะกระโดดไปหน้าคน null
		//   → ปล่อยว่าง ให้เรียงตามชื่อรวมกับเพื่อนร่วมงาน (ไม่แทรกหน้า)
		const allEmpsSnap = await db.collection("employees").get();
		const orders: number[] = [];
		for (const d of allEmpsSnap.docs) {
			const v = d.data()?.displayOrder;
			if (typeof v === "number") orders.push(v);
		}
		const everyoneOrdered =
			allEmpsSnap.size > 0 && orders.length === allEmpsSnap.size;
		const nextOrder = everyoneOrdered ? Math.max(...orders) + 1 : null;

		const employeeRef = db.collection("employees").doc();
		await employeeRef.set({
			name: setupCommand.employeeKey,
			role: "-",
			roleId: "",
			...(nextOrder !== null ? { displayOrder: nextOrder } : {}),
			avatar: makeAvatarText(setupCommand.employeeKey),
			avatarType: "text",
			avatarImageUrl: null,
			lineUserId: setupCommand.targetLineUserId,
			balance: { personal: 15, sick: 15 },
			used: { personal: 0, sick: 0 },
			lineLinkedAt: FieldValue.serverTimestamp(),
			lineLinkedBy: senderLineUserId,
			lineLinkedFromGroup:
				event.source?.groupId || event.source?.roomId || null,
			createdAt: FieldValue.serverTimestamp(),
			updatedAt: FieldValue.serverTimestamp(),
		});

		await replyText(
			config,
			event.replyToken,
			`เพิ่มพนักงานและเปิดสิทธิ์ LINE Login ให้ ${setupCommand.employeeKey} เรียบร้อย\n${setupCommand.targetMentionText}: ${setupCommand.targetLineUserId}${setupCommand.hasExplicitName ? "" : "\nแก้ชื่อพนักงานได้ในแอป (ADMIN → พนักงาน)"}`,
		);
		return;
	}

	if (employeeResult.status === "ambiguous") {
		await replyText(
			config,
			event.replyToken,
			`ค้นหาด้วยชื่อ "${setupCommand.employeeKey}" แล้วพบพนักงานใกล้เคียงหลายคน: ${employeeResult.employees
				.map((employee) => employee.name)
				.join(
					", ",
				)}\nกรุณาพิมพ์ชื่อพนักงานต่อท้ายการแท็ก เช่น @บอท เชื่อมพนักงาน @พนักงาน ${employeeResult.employees[0].name}`,
		);
		return;
	}

	const employee = employeeResult.employee;
	if (existingLinkedEmployee && existingLinkedEmployee.id !== employee.id) {
		await replyText(
			config,
			event.replyToken,
			`LINE account นี้ถูกเชื่อมกับ ${existingLinkedEmployee.name} แล้ว`,
		);
		return;
	}

	if (
		employee.lineUserId &&
		employee.lineUserId !== setupCommand.targetLineUserId
	) {
		await replyText(
			config,
			event.replyToken,
			`${employee.name} ถูกเชื่อมกับ LINE account อื่นแล้ว`,
		);
		return;
	}

	await ensureLineAuthUser(setupCommand.targetLineUserId, employee.name);

	await db
		.collection("employees")
		.doc(employee.id)
		.set(
			{
				lineUserId: setupCommand.targetLineUserId,
				lineLinkedAt: FieldValue.serverTimestamp(),
				lineLinkedBy: senderLineUserId,
				lineLinkedFromGroup:
					event.source?.groupId || event.source?.roomId || null,
				updatedAt: FieldValue.serverTimestamp(),
			},
			{ merge: true },
		);

	await replyText(
		config,
		event.replyToken,
		`เชื่อม LINE และเปิดสิทธิ์ LINE Login ให้ ${employee.name} เรียบร้อย\n${setupCommand.targetMentionText}: ${setupCommand.targetLineUserId}`,
	);
}

function parseSetupEmployeeCommand(event: LineEvent): SetupCommand | null {
	const text = event.message?.text;
	if (!text) return null;

	const setupMatch = getSetupEmployeeMatch(text);
	if (!setupMatch) return null;

	const mentionees = getMentionees(event);
	if (!isAddressedToBot(event)) return null;

	const commandEnd = setupMatch.index + setupMatch[0].length;
	const targetMention =
		mentionees.find(
			(mentionee) =>
				mentionee.type === "user" &&
				mentionee.isSelf !== true &&
				!!mentionee.userId &&
				mentionee.index >= commandEnd,
		) ||
		mentionees.find(
			(mentionee) =>
				mentionee.type === "user" &&
				mentionee.isSelf !== true &&
				!!mentionee.userId,
		);

	if (!targetMention?.userId) return null;

	const textWithoutMentions = removeMentionRanges(text, mentionees);
	const strippedSetupMatch = /(?:^|\s)เชื่อมพนักงาน(?:\s|$)/.exec(
		textWithoutMentions,
	);
	const explicitEmployeeKey = strippedSetupMatch
		? normalizeSpaces(
				textWithoutMentions.slice(
					strippedSetupMatch.index + strippedSetupMatch[0].length,
				),
			)
		: "";
	const targetMentionText = cleanMentionText(
		getMentionText(text, targetMention),
	);
	const employeeKey = explicitEmployeeKey || targetMentionText;

	if (!employeeKey) return null;

	return {
		targetLineUserId: targetMention.userId,
		targetMentionText,
		employeeKey,
		hasExplicitName: !!explicitEmployeeKey,
	};
}

function hasSetupEmployeePhrase(text: string): boolean {
	return !!getSetupEmployeeMatch(text);
}

function getSetupEmployeeMatch(text: string): RegExpExecArray | null {
	return /(?:^|\s)เชื่อมพนักงาน(?:\s|$)/.exec(text);
}

function normalizeLookupKey(value: string): string {
	return normalizeSpaces(value).normalize("NFKC").toLocaleLowerCase();
}

function makeAvatarText(name: string): string {
	const letters = Array.from(name.replace(/\s+/g, ""));
	return letters.slice(0, 2).join("") || "-";
}

async function ensureLineAuthUser(
	lineUserId: string,
	displayName: string,
): Promise<void> {
	const auth = getAuth();
	try {
		await auth.getUser(lineUserId);
		return;
	} catch (error) {
		if ((error as { code?: string }).code !== "auth/user-not-found") {
			throw error;
		}
	}

	await auth.createUser({
		uid: lineUserId,
		displayName,
	});
}

// เทียบชื่อแบบตัดสัญลักษณ์/emoji/ช่องว่างทิ้ง — "M-I-N-T🍒" ↔ "mint"
// (เก็บสระ/วรรณยุกต์ไทยไว้ด้วย \p{M})
const NON_NAME_CHARS = /[^\p{L}\p{M}\p{N}]+/gu;

function compactLookupKey(value: string): string {
	return normalizeLookupKey(value).replace(NON_NAME_CHARS, "");
}

// key สั้นกว่านี้ไม่เอาไปเทียบแบบ "มีคำนี้อยู่ในชื่อ" — ไม่งั้นชื่อ LINE
// ตัวเดียวอย่าง "m" จะไปตรงกับทุกคนที่มีตัว m ในชื่อ
const MIN_LOOSE_KEY_LENGTH = 2;

async function findEmployeeByKey(
	db: Firestore,
	key: string,
): Promise<EmployeeLookupResult> {
	const snapshot = await db.collection("employees").get();
	const employees: EmployeeRecord[] = snapshot.docs.map((doc) => {
		const data = doc.data() as {
			name?: unknown;
			nickname?: unknown;
			lineUserId?: unknown;
		};
		return {
			id: doc.id,
			name: typeof data.name === "string" ? data.name : doc.id,
			nickname:
				typeof data.nickname === "string" && data.nickname.trim()
					? data.nickname
					: undefined,
			lineUserId:
				typeof data.lineUserId === "string" ? data.lineUserId : undefined,
		};
	});
	return matchEmployeeByKey(employees, key);
}

export function matchEmployeeByKey(
	employees: EmployeeRecord[],
	key: string,
): EmployeeLookupResult {
	const normalizedKey = normalizeLookupKey(key);
	const compactKey = compactLookupKey(key);
	const namesOf = (employee: EmployeeRecord) =>
		employee.nickname ? [employee.name, employee.nickname] : [employee.name];

	const pick = (matches: EmployeeRecord[]): EmployeeLookupResult | null => {
		if (matches.length === 1) return { status: "found", employee: matches[0] };
		if (matches.length > 1) {
			return { status: "ambiguous", employees: matches.slice(0, 5) };
		}
		return null;
	};

	const exact = pick(
		employees.filter(
			(employee) =>
				normalizeLookupKey(employee.id) === normalizedKey ||
				namesOf(employee).some(
					(name) => normalizeLookupKey(name) === normalizedKey,
				),
		),
	);
	if (exact) return exact;

	if (compactKey) {
		const compactExact = pick(
			employees.filter((employee) =>
				namesOf(employee).some((name) => compactLookupKey(name) === compactKey),
			),
		);
		if (compactExact) return compactExact;
	}

	if (Array.from(compactKey).length >= MIN_LOOSE_KEY_LENGTH) {
		const loose = pick(
			employees.filter((employee) =>
				namesOf(employee).some((name) =>
					compactLookupKey(name).includes(compactKey),
				),
			),
		);
		if (loose) return loose;
	}

	return { status: "not-found" };
}

async function findEmployeeByLineUserId(
	db: Firestore,
	lineUserId: string,
): Promise<EmployeeRecord | null> {
	const snapshot = await db
		.collection("employees")
		.where("lineUserId", "==", lineUserId)
		.limit(1)
		.get();
	if (snapshot.empty) return null;

	const doc = snapshot.docs[0];
	const data = doc.data() as { name?: unknown; lineUserId?: unknown };
	return {
		id: doc.id,
		name: typeof data.name === "string" ? data.name : doc.id,
		lineUserId:
			typeof data.lineUserId === "string" ? data.lineUserId : undefined,
	};
}
