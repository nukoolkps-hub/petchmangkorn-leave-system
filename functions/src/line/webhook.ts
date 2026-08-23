/**
 * lineWebhook — LINE Messaging API webhook.
 *
 * Text command handlers live in functions/src/line/commands.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { onRequest } from "firebase-functions/v2/https";
import { getLineConfig } from "../helpers/config.js";
import type { LineConfig } from "../types.js";
import { dispatchLineCommand } from "./core/dispatcher.js";
import type { LineEvent, LineHttpRequest } from "./core/types.js";

// appspot SA — ต้องการเพราะ ทดสอบแจ้งเตือน command เรียก runDailySummary
// ที่อ่าน Google Calendar (user แชร์ให้ appspot SA ไว้ ไม่ใช่ compute SA)
export const lineWebhook = onRequest(
	async (request, res) => {
	if (request.method !== "POST") {
		res.status(405).send("Method Not Allowed");
		return;
	}

	try {
		const config = await getLineConfig();
		if (!config.LINE_CHANNEL_SECRET) {
			console.error("LINE_CHANNEL_SECRET is not configured");
			res.status(503).json({ ok: false, error: "webhook not configured" });
			return;
		}

		const signatureOk = verifyLineRequest(request, config);
		if (!signatureOk) {
			res.status(401).json({ ok: false, error: "invalid LINE signature" });
			return;
		}

		const body = request.body as { events?: LineEvent[] };
		const events = Array.isArray(body.events) ? body.events : [];

		for (const event of events) {
			if (event.type !== "message" || event.message?.type !== "text") continue;

			await dispatchLineCommand({
				config,
				event,
				text: event.message.text.trim(),
				signatureOk,
			});
		}

		res.json({ ok: true });
	} catch (err) {
		console.error("webhook error:", err);
		res.status(500).json({ ok: false });
	}
});

function verifyLineRequest(
	request: LineHttpRequest,
	config: LineConfig,
): boolean {
	if (!config.LINE_CHANNEL_SECRET) return false;

	const signature = request.get("x-line-signature");
	const rawBody = request.rawBody;
	if (!signature || !rawBody) return false;

	const expected = createHmac("sha256", config.LINE_CHANNEL_SECRET)
		.update(rawBody)
		.digest("base64");
	const expectedBuffer = Buffer.from(expected);
	const signatureBuffer = Buffer.from(signature);

	return (
		expectedBuffer.length === signatureBuffer.length &&
		timingSafeEqual(expectedBuffer, signatureBuffer)
	);
}
