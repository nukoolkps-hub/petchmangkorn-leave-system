/**
 * ทดสอบแจ้งเตือน — admin พิมพ์ในแชท/กลุ่ม → bot push ตัวอย่าง daily
 * summary flex message มาที่ผู้ที่พิมพ์ (เพื่อดู layout ก่อนรอ 07:30)
 *
 * ใช้ runDailySummary ตัวเดียวกับที่ scheduled function เรียก — ตัวอย่าง
 * จะเหมือนกับที่จะส่งจริง 100%
 */

import { pushLineMessage } from "../../helpers/line.js";
import { runDailySummary } from "../../dailySummary/sendDailySummary.js";
import { isAuthorizedLineAdmin } from "../core/admin.js";
import { getMentionees, removeMentionRanges } from "../core/message.js";
import { replyText } from "../core/reply.js";
import { type LineCommand, matched, notMatched } from "../core/types.js";

const TRIGGER = "ทดสอบแจ้งเตือน";

function normalize(s: string): string {
	return s.replace(/\s+/g, "");
}

export const previewNotifyCommand: LineCommand<void> = {
	name: "ทดสอบแจ้งเตือน",
	parse({ event, text }) {
		const selfMentions = getMentionees(event).filter(
			(m) => m.type === "user" && m.isSelf === true,
		);
		const cleaned = normalize(removeMentionRanges(text, selfMentions));
		return cleaned === normalize(TRIGGER) ? matched(undefined) : notMatched();
	},
	async handle({ config, event }) {
		if (!event.replyToken) return;

		const senderLineUserId = event.source?.userId;
		if (!senderLineUserId) return;

		const admin = await isAuthorizedLineAdmin(senderLineUserId, config);
		if (!admin) return;

		const token = config.LINE_CHANNEL_ACCESS_TOKEN;
		if (!token) {
			await replyText(
				config,
				event.replyToken,
				"LINE_CHANNEL_ACCESS_TOKEN ยังไม่ได้ตั้ง",
			);
			return;
		}

		// reply ก่อนแล้วค่อย push ตามทีหลัง — กัน reply token หมดอายุ
		// ระหว่างรอ query ใบลา
		await replyText(
			config,
			event.replyToken,
			"📋 กำลังเตรียมตัวอย่างสรุปประจำวัน... รอสักครู่",
		);

		try {
			const results = await runDailySummary({
				targetOverride: senderLineUserId,
			});
			const sentCount = results.filter((r) => r.sent).length;
			await pushLineMessage(token, senderLineUserId, {
				type: "text",
				text: `✅ ส่งตัวอย่างแล้ว (${sentCount}/${results.length})\n(ของจริงส่งเข้ากลุ่มตอน 07:30 ทุกวัน)`,
			});
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			await pushLineMessage(token, senderLineUserId, {
				type: "text",
				text: `⚠️ ทดสอบไม่สำเร็จ: ${msg}`,
			});
		}
	},
};
