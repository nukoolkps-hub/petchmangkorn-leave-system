/**
 * Runtime validation for callable payloads.
 */

import { HttpsError } from "firebase-functions/v2/https";
import type {
	BootstrapAdminPayload,
	DevAuthPayload,
	LineAuthPayload,
	SetAdminPayload,
} from "../types.js";

type UnknownRecord = Record<string, unknown>;

function invalid(message: string): never {
	throw new HttpsError("invalid-argument", message);
}

function asRecord(value: unknown): UnknownRecord {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		invalid("Payload must be an object");
	}
	return value as UnknownRecord;
}

function requiredString(data: UnknownRecord, key: string): string {
	const value = data[key];
	if (typeof value !== "string" || value.trim() === "") {
		invalid(`Missing or invalid ${key}`);
	}
	return value.trim();
}

export function parseLineAuthPayload(value: unknown): LineAuthPayload {
	const data = asRecord(value);
	const redirectUri = requiredString(data, "redirectUri");
	try {
		const url = new URL(redirectUri);
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			invalid("Invalid redirectUri");
		}
	} catch {
		invalid("Invalid redirectUri");
	}

	const state = requiredString(data, "state");
	// state จาก server (prepareLineLogin) เป็น base64url ของ 32 ไบต์ random
	// → กัน payload bloat / state injection ของแปลกๆ ที่ยาวเกินจริง
	if (state.length > 128) invalid("Invalid state");

	return {
		code: requiredString(data, "code"),
		redirectUri,
		state,
	};
}

export function parseDevAuthPayload(value: unknown): DevAuthPayload {
	const data = asRecord(value);
	const role = requiredString(data, "role");
	if (role !== "employee" && role !== "admin" && role !== "setup") {
		invalid("Invalid dev role");
	}
	return { role };
}

export function parseSetAdminPayload(value: unknown): SetAdminPayload {
	const data = asRecord(value);
	if (typeof data.isAdmin !== "boolean") {
		invalid("Missing or invalid isAdmin");
	}
	return {
		uid: requiredString(data, "uid"),
		isAdmin: data.isAdmin,
	};
}

export function parseBootstrapAdminPayload(
	value: unknown,
): BootstrapAdminPayload {
	const data = asRecord(value);
	return {
		setupSecret: requiredString(data, "setupSecret"),
	};
}
