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
}

/* ─── onCall payload types ────────────────────────────────────── */
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
