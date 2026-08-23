/**
 * LINE Messaging API helpers
 */

import type { LinePushMessage } from "../types.js";

/** Host ที่เชื่อถือได้สำหรับ LINE image message (originalContentUrl/previewImageUrl)
 *  — จำกัดเฉพาะ Firebase/Google Storage เพื่อกัน admin/พนักงานใส่ URL ภายนอก
 *  (SSRF / รูปหลุด) · LINE ดึงรูปฝั่ง server ผ่าน token URL (ไม่ต้อง auth)     */
const TRUSTED_IMAGE_HOSTS = [
	"storage.googleapis.com",
	"firebasestorage.googleapis.com",
];

/** true ถ้า url เป็น https + host อยู่ใน TRUSTED_IMAGE_HOSTS */
export function isTrustedImageUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== "https:") return false;
		return TRUSTED_IMAGE_HOSTS.some((host) => parsed.hostname === host);
	} catch {
		return false;
	}
}

/**
 * Push message(s) to a LINE user via the Messaging API.
 */
export async function pushLineMessage(
	token: string,
	to: string,
	messages: LinePushMessage | LinePushMessage[],
): Promise<void> {
	const response = await fetch("https://api.line.me/v2/bot/message/push", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${token}`,
		},
		body: JSON.stringify({
			to,
			messages: Array.isArray(messages) ? messages : [messages],
		}),
	});

	if (!response.ok) {
		const body = await response.text();
		console.error("LINE push failed:", response.status, body);
		throw new Error(`LINE push failed: ${response.status} ${body}`);
	}
}

/**
 * Reply to a LINE webhook event.
 */
export async function replyLineMessage(
	token: string,
	replyToken: string,
	messages: LinePushMessage | LinePushMessage[],
): Promise<void> {
	const response = await fetch("https://api.line.me/v2/bot/message/reply", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${token}`,
		},
		body: JSON.stringify({
			replyToken,
			messages: Array.isArray(messages) ? messages : [messages],
		}),
	});

	if (!response.ok) {
		console.error("LINE reply failed:", response.status, await response.text());
	}
}
