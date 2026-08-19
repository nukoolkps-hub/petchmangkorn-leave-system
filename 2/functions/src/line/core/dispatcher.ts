import { match } from "ts-pattern";
import { groupIdCommand } from "../commands/groupId.js";
import { helpCommand } from "../commands/help.js";
import { idCommand } from "../commands/id.js";
import { myIdCommand } from "../commands/myId.js";
import { previewNotifyCommand } from "../commands/previewNotify.js";
import { setupEmployeeCommand } from "../commands/setupEmployee.js";
import { replyText } from "./reply.js";
import type { LineCommand, LineCommandContext } from "./types.js";

const commands: LineCommand[] = [
	myIdCommand,
	groupIdCommand,
	helpCommand,
	idCommand,
	setupEmployeeCommand,
	previewNotifyCommand,
];

export async function dispatchLineCommand(
	ctx: LineCommandContext,
): Promise<void> {
	for (const command of commands) {
		const result = command.parse(ctx);
		const handled = await match(result)
			.with({ kind: "not-matched" }, () => false)
			.with({ kind: "invalid" }, async ({ reply }) => {
				await replyText(ctx.config, ctx.event.replyToken, reply);
				return true;
			})
			.with({ kind: "matched" }, async ({ payload }) => {
				await command.handle(ctx, payload);
				return true;
			})
			.exhaustive();

		if (handled) return;
	}
}
