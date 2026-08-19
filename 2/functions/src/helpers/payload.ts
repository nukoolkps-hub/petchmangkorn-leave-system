/**
 * Runtime validation for callable payloads.
 */

import { HttpsError } from "firebase-functions/v2/https";
import type {
	BootstrapAdminPayload,
	DevAuthPayload,
	LineAuthPayload,
	NotifyAdvanceRequestPayload,
	RequestId,
	SetAdminPayload,
} from "../types.js";

type UnknownRecord = Record<string, unknown>;

const PAYROLL_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

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

function optionalString(data: UnknownRecord, key: string): string | undefined {
	const value = data[key];
	if (value === undefined || value === null) return undefined;
	if (typeof value !== "string") invalid(`Invalid ${key}`);
	const trimmed = value.trim();
	return trimmed === "" ? undefined : trimmed;
}

function requiredAmount(data: UnknownRecord): number {
	const value = data.amount;
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		invalid("Missing or invalid amount");
	}
	return value;
}

function requiredPayrollMonth(data: UnknownRecord): string {
	const month = requiredString(data, "month");
	if (!PAYROLL_MONTH_PATTERN.test(month)) {
		invalid("Invalid month; expected YYYY-MM");
	}
	return month;
}

function optionalDateString(
	data: UnknownRecord,
	key: string,
): string | undefined {
	const value = optionalString(data, key);
	if (!value) return undefined;
	if (Number.isNaN(Date.parse(value))) invalid(`Invalid ${key}`);
	return value;
}

function optionalRequestId(data: UnknownRecord): RequestId | undefined {
	const value = data.requestId;
	if (value === undefined || value === null) return undefined;
	if (typeof value === "string" && value.trim() !== "") return value.trim();
	if (typeof value === "number" && Number.isFinite(value)) return value;
	invalid("Invalid requestId");
}

export function parseNotifyAdvanceRequestPayload(
	value: unknown,
): NotifyAdvanceRequestPayload {
	const data = asRecord(value);
	return {
		employeeName: requiredString(data, "employeeName"),
		amount: requiredAmount(data),
		// เหตุผลไม่บังคับ (ฟอร์มปล่อยว่างได้) — เดิม required → throw → LINE ไม่ส่ง
		reason: optionalString(data, "reason"),
		month: requiredPayrollMonth(data),
		bank: optionalString(data, "bank"),
		bankAccountNumber: optionalString(data, "bankAccountNumber"),
		submittedAt: optionalDateString(data, "submittedAt"),
		requestId: optionalRequestId(data),
	};
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
