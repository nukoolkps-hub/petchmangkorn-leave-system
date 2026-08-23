import { COLORS } from "../../helpers/config.js";
import type { LinePushMessage } from "../../types.js";
import { isAuthorizedLineAdmin } from "../core/admin.js";
import { replyMessage } from "../core/reply.js";
import { type LineCommand, matched, notMatched } from "../core/types.js";

const HELP_ALT_TEXT = "คำสั่งสำหรับผู้ดูแลระบบ";

export const helpCommand: LineCommand<void> = {
	name: "คำสั่ง",
	parse({ text }) {
		return text === "คำสั่ง" ? matched(undefined) : notMatched();
	},
	async handle({ config, event }) {
		if (event.source?.type !== "user") return;
		if (!event.replyToken) return;

		const senderLineUserId = event.source.userId;
		if (!senderLineUserId) return;

		const admin = await isAuthorizedLineAdmin(senderLineUserId, config);
		if (!admin) return;

		await replyMessage(config, event.replyToken, makeHelpFlexMessage());
	},
};

function makeHelpFlexMessage(): LinePushMessage {
	return {
		type: "flex",
		altText: HELP_ALT_TEXT,
		contents: {
			type: "bubble",
			size: "giga",
			header: {
				type: "box",
				layout: "vertical",
				backgroundColor: COLORS.maroon,
				paddingAll: "16px",
				contents: [
					{
						type: "text",
						text: HELP_ALT_TEXT,
						color: COLORS.goldLight,
						weight: "bold",
						size: "lg",
					},
					{
						type: "text",
						text: "ห้างทองเพชรมังกร",
						color: COLORS.goldLight,
						size: "xs",
						margin: "sm",
					},
				],
			},
			body: {
				type: "box",
				layout: "vertical",
				spacing: "md",
				contents: [
					commandBox({
						command: "ไอดีฉัน",
						description: "ดูไอดี LINE ของตัวเอง",
						scope: "แชทส่วนตัว",
					}),
					commandBox({
						command: "คำสั่ง",
						description: "ดูคำสั่งทั้งหมด",
						scope: "แชทส่วนตัว",
					}),
					commandBox({
						command: "ไอดีกลุ่ม",
						description: "ดู Group ID ของกลุ่มนี้",
						scope: "กลุ่ม",
					}),
					commandBox({
						command: "@บอท ไอดี @ผู้ใช้ไลน์",
						description: "ดูไอดี LINE ของผู้ใช้ที่แท็ก",
						scope: "กลุ่ม",
					}),
					commandBox({
						command: "@บอท เชื่อมพนักงาน @พนักงาน",
						description: "เชื่อมบัญชี LINE ให้พนักงานจากการแท็ก",
						scope: "กลุ่ม",
					}),
					commandBox({
						command: "@บอท เชื่อมพนักงาน @พนักงาน ชื่อพนักงาน",
						description: "เชื่อมหรือเพิ่มพนักงานด้วยชื่อที่ระบุ",
						scope: "กลุ่ม",
					}),
					commandBox({
						command: "ทดสอบแจ้งเตือน",
						description: "Bot push ตัวอย่างสรุปเช้า (ใครหยุดวันนี้) มาให้ดู",
						scope: "แชทส่วนตัว",
					}),
				],
			},
		},
	};
}

function commandBox({
	command,
	description,
	scope,
}: {
	command: string;
	description: string;
	scope: CommandScope;
}): Record<string, unknown> {
	return {
		type: "box",
		layout: "vertical",
		backgroundColor: COLORS.goldPale,
		cornerRadius: "8px",
		paddingAll: "12px",
		spacing: "sm",
		contents: [
			{
				type: "box",
				layout: "horizontal",
				justifyContent: "flex-end",
				contents: [scopeBadge(scope)],
			},
			{
				type: "text",
				text: command,
				color: COLORS.maroon,
				weight: "bold",
				size: "sm",
				wrap: true,
			},
			{
				type: "text",
				text: description,
				color: COLORS.textMedium,
				size: "xs",
				wrap: true,
			},
		],
	};
}

type CommandScope = "แชทส่วนตัว" | "กลุ่ม";

function scopeBadge(scope: CommandScope): Record<string, unknown> {
	const isDirect = scope === "แชทส่วนตัว";

	return {
		type: "box",
		layout: "vertical",
		backgroundColor: isDirect ? COLORS.greenLight : COLORS.goldLight,
		cornerRadius: "999px",
		paddingStart: "10px",
		paddingEnd: "10px",
		paddingTop: "3px",
		paddingBottom: "3px",
		flex: 0,
		contents: [
			{
				type: "text",
				text: scope,
				color: isDirect ? COLORS.green : COLORS.maroon,
				size: "xxs",
				weight: "bold",
				align: "center",
			},
		],
	};
}
