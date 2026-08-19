import { replyLineMessage } from "../../helpers/line.js";
import type { LineConfig, LinePushMessage } from "../../types.js";

export async function replyMessage(
	config: LineConfig,
	replyToken: string | undefined,
	messages: LinePushMessage | LinePushMessage[],
): Promise<void> {
	if (!replyToken) return;
	if (!config.LINE_CHANNEL_ACCESS_TOKEN) {
		console.warn("LINE_CHANNEL_ACCESS_TOKEN is not configured; cannot reply");
		return;
	}

	await replyLineMessage(
		config.LINE_CHANNEL_ACCESS_TOKEN,
		replyToken,
		messages,
	);
}

export async function replyText(
	config: LineConfig,
	replyToken: string | undefined,
	text: string,
): Promise<void> {
	await replyMessage(config, replyToken, {
		type: "text",
		text,
	});
}
