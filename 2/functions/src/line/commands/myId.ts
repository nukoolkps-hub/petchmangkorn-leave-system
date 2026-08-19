import { replyText } from "../core/reply.js";
import { type LineCommand, matched, notMatched } from "../core/types.js";

export const myIdCommand: LineCommand<void> = {
	name: "ไอดีฉัน",
	parse({ event, text }) {
		if (event.source?.type === "user" && text === "ไอดีฉัน") {
			return matched(undefined);
		}

		return notMatched();
	},
	async handle({ config, event }) {
		if (!event.replyToken) return;

		const senderLineUserId = event.source?.userId;
		if (!senderLineUserId) {
			await replyText(config, event.replyToken, "ไม่พบ LINE user ID ของคุณ");
			return;
		}

		await replyText(
			config,
			event.replyToken,
			`LINE user ID ของคุณ:\n${senderLineUserId}`,
		);
	},
};
