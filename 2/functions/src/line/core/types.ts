import type { LineConfig } from "../../types.js";

export interface LineMentionee {
	index: number;
	length: number;
	userId?: string;
	type?: string;
	isSelf?: boolean;
}

export interface LineTextMessage {
	type: "text";
	text: string;
	mention?: {
		mentionees?: LineMentionee[];
	};
}

export interface LineSource {
	type?: "user" | "group" | "room";
	userId?: string;
	groupId?: string;
	roomId?: string;
}

export interface LineEvent {
	type: string;
	replyToken?: string;
	message?: LineTextMessage;
	source?: LineSource;
}

export interface LineHttpRequest {
	get(name: string): string | undefined;
	rawBody?: Buffer;
}

export interface LineCommandContext {
	config: LineConfig;
	event: LineEvent;
	text: string;
	signatureOk: boolean;
}

export type CommandParseResult<TPayload> =
	| { kind: "matched"; payload: TPayload }
	| { kind: "invalid"; reply: string }
	| { kind: "not-matched" };

export interface LineCommand<TPayload = unknown> {
	name: string;
	parse(ctx: LineCommandContext): CommandParseResult<TPayload>;
	handle(ctx: LineCommandContext, payload: TPayload): Promise<void>;
}

export function matched<TPayload>(
	payload: TPayload,
): CommandParseResult<TPayload> {
	return { kind: "matched", payload };
}

export function invalid<TPayload = never>(
	reply: string,
): CommandParseResult<TPayload> {
	return { kind: "invalid", reply };
}

export function notMatched<TPayload = never>(): CommandParseResult<TPayload> {
	return { kind: "not-matched" };
}
