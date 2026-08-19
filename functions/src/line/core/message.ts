import type { LineEvent, LineMentionee } from "./types.js";

export function getMentionees(event: LineEvent): LineMentionee[] {
	return event.message?.mention?.mentionees || [];
}

export function getUserMentionees(event: LineEvent): LineMentionee[] {
	return getMentionees(event).filter(
		(mentionee) =>
			mentionee.type === "user" &&
			mentionee.isSelf !== true &&
			!!mentionee.userId,
	);
}

export function isGroupOrRoom(event: LineEvent): boolean {
	return event.source?.type === "group" || event.source?.type === "room";
}

export function isBotMentioned(event: LineEvent): boolean {
	return getMentionees(event).some(
		(mentionee) => mentionee.type === "user" && mentionee.isSelf === true,
	);
}

export function isAddressedToBot(event: LineEvent): boolean {
	if (!isGroupOrRoom(event)) return true;
	return isBotMentioned(event);
}

export function removeMentionRanges(
	text: string,
	mentionees: LineMentionee[],
): string {
	return mentionees
		.map((mentionee) => ({
			start: mentionee.index,
			end: mentionee.index + mentionee.length,
		}))
		.filter((range) => range.start >= 0 && range.end <= text.length)
		.sort((a, b) => b.start - a.start)
		.reduce(
			(result, range) => result.slice(0, range.start) + result.slice(range.end),
			text,
		);
}

export function getMentionText(text: string, mentionee: LineMentionee): string {
	return text.slice(mentionee.index, mentionee.index + mentionee.length);
}

export function cleanMentionText(value: string): string {
	return normalizeSpaces(value.replace(/^@/, ""));
}

export function normalizeSpaces(value: string): string {
	return value.trim().replace(/\s+/g, " ");
}
