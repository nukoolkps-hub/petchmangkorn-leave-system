import { isAuthorizedLineAdmin } from "../core/admin.js";
import {
	cleanMentionText,
	getMentionees,
	getMentionText,
	getUserMentionees,
	isAddressedToBot,
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

const ID_COMMAND_USAGE =
	"กรุณาใช้รูปแบบ @บอท ไอดี @ผู้ใช้ไลน์ และแท็กผู้ใช้ LINE จริงในกลุ่ม";

interface IdCommandPayload {
	targetLineUserId: string;
	targetMentionText: string;
}

export const idCommand: LineCommand<IdCommandPayload> = {
	name: "ไอดี",
	parse({ event }) {
		const idCommand = parseIdCommand(event);
		if (idCommand) return matched(idCommand);

		if (hasIdCommandPhrase(event) && isAddressedToBot(event)) {
			return invalid(ID_COMMAND_USAGE);
		}

		return notMatched();
	},
	async handle({ config, event, signatureOk }, payload) {
		if (!signatureOk) {
			await replyText(
				config,
				event.replyToken,
				"ยังไม่ได้ตั้งค่า LINE_CHANNEL_SECRET จึงไม่สามารถใช้คำสั่ง ไอดี ได้",
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

		await replyText(
			config,
			event.replyToken,
			`${payload.targetMentionText} ไอดี LINE:\n${payload.targetLineUserId}`,
		);
	},
};

function parseIdCommand(event: LineEvent): IdCommandPayload | null {
	const text = event.message?.text;
	if (!text || !hasIdCommandPhrase(event) || !isAddressedToBot(event)) {
		return null;
	}

	const targetMention = getUserMentionees(event)[0];
	if (!targetMention?.userId) return null;

	return {
		targetLineUserId: targetMention.userId,
		targetMentionText: cleanMentionText(getMentionText(text, targetMention)),
	};
}

function hasIdCommandPhrase(event: LineEvent): boolean {
	const text = event.message?.text;
	if (!text) return false;

	const selfMentions = getMentionees(event).filter(
		(mentionee) => mentionee.type === "user" && mentionee.isSelf === true,
	);
	const textWithoutBotMentions = removeMentionRanges(text, selfMentions);

	return /^ไอดี(?:\s|$)/.test(textWithoutBotMentions.trim());
}
