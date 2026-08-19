/**
 * Shared type definitions — ห้างทองเพชรมังกร ระบบการลา
 */

/* ─── LINE config stored in Firestore /config/secrets ─────────── */
export interface LineConfig {
	LINE_CHANNEL_ACCESS_TOKEN?: string;
	LINE_CHANNEL_SECRET?: string;
	ADMIN_LINE_USER_ID?: string;
	LINE_LOGIN_CHANNEL_ID?: string;
	LINE_LOGIN_CHANNEL_SECRET?: string;
	// Claude API key สำหรับ generateDailyTip — ตั้งใน Firestore /config/secrets
	// (เก็บที่เดียวกับ LINE config เพื่อ minimize Secret Manager versions)
	ANTHROPIC_API_KEY?: string;
}

export type ISODateString = string;
export type PayrollMonth = string;
export type RequestId = string | number;

/* ─── onCall payload types ────────────────────────────────────── */
export interface NotifyAdvanceRequestPayload {
	employeeName: string;
	amount: number;
	// เหตุผล "ไม่บังคับ" ในฟอร์ม → optional (เดิม required ทำให้ callable throw
	// เมื่อเบิกโดยไม่กรอกเหตุผล → LINE ไม่ส่งแบบเงียบๆ)
	reason?: string;
	month: PayrollMonth;
	bank?: string;
	bankAccountNumber?: string;
	submittedAt?: ISODateString;
	requestId?: RequestId;
}

export interface LineAuthPayload {
	code: string;
	redirectUri: string;
	state: string;
}

export interface DevAuthPayload {
	role: "employee" | "admin" | "setup";
}

export interface SetAdminPayload {
	uid: string;
	isAdmin: boolean;
}

export interface BootstrapAdminPayload {
	setupSecret: string;
}

/* ─── LINE Message types (subset used in this project) ────────── */
export interface LineTextMessage {
	type: "text";
	text: string;
}

export interface LineFlexMessage {
	type: "flex";
	altText: string;
	contents: Record<string, unknown>;
}

export interface LineImageMessage {
	type: "image";
	originalContentUrl: string;
	previewImageUrl: string;
}

export type LinePushMessage =
	| LineTextMessage
	| LineFlexMessage
	| LineImageMessage;
