import { isAuthorizedLineAdmin } from "../core/admin.js";
import {
	getMentionees,
	isGroupOrRoom,
	removeMentionRanges,
} from "../core/message.js";
import { replyText } from "../core/reply.js";
import { type LineCommand, matched, notMatched } from "../core/types.js";

export const groupIdCommand: LineCommand<void> = {
	name: "ไอดีกลุ่ม",
	parse({ event, text }) {
		if (!isGroupOrRoom(event)) return notMatched();

		const selfMentions = getMentionees(event).filter(
			(m) => m.type === "user" && m.isSelf === true,
		);
		const cleaned = removeMentionRanges(text, selfMentions).trim();

		if (cleaned === "ไอดีกลุ่ม") return matched(undefined);

		return notMatched();
	},
	async handle({ config, event }) {
		if (!event.replyToken) return;

		const senderLineUserId = event.source?.userId;
		if (!senderLineUserId) return;

		const admin = await isAuthorizedLineAdmin(senderLineUserId, config);
		if (!admin) return;

		const groupId = event.source?.groupId || event.source?.roomId;
		if (!groupId) {
			await replyText(config, event.replyToken, "ไม่พบ Group ID");
			return;
		}

		const label = event.source?.type === "room" ? "Room ID" : "Group ID";
		await replyText(
			config,
			event.replyToken,
			`${label} ของกลุ่มนี้:\n${groupId}`,
		);
	},
};
