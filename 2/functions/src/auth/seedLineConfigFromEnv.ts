/**
 * seedLineConfigFromEnv — emulator-only helper for the login screen Seed Demo
 * action. Runtime LINE config is still read from Firestore /config/secrets.
 */

import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getAppFirestore } from "../helpers/config.js";
import type { LineConfig } from "../types.js";

const LINE_CONFIG_KEYS = [
	"LINE_CHANNEL_ACCESS_TOKEN",
	"LINE_CHANNEL_SECRET",
	"ADMIN_LINE_USER_ID",
	"LINE_LOGIN_CHANNEL_ID",
	"LINE_LOGIN_CHANNEL_SECRET",
] as const satisfies readonly (keyof LineConfig)[];

function nonEmptyEnv(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed || undefined;
}

function getLineConfigFromEnv(): LineConfig {
	const config: LineConfig = {};
	for (const key of LINE_CONFIG_KEYS) {
		const value = nonEmptyEnv(process.env[key]);
		if (value) config[key] = value;
	}
	return config;
}

export const seedLineConfigFromEnv = onCall(async () => {
	if (process.env.FUNCTIONS_EMULATOR !== "true") {
		throw new HttpsError(
			"failed-precondition",
			"LINE config env seeding is available only in the Firebase emulator",
		);
	}

	const config = getLineConfigFromEnv();
	const seededKeys = Object.keys(config);
	if (seededKeys.length === 0) {
		return { ok: true, skipped: true, seededKeys };
	}

	await getAppFirestore()
		.doc("config/secrets")
		.set(
			{
				...config,
				updatedAt: FieldValue.serverTimestamp(),
				updatedBy: "seedLineConfigFromEnv",
			},
			{ merge: true },
		);

	return { ok: true, skipped: false, seededKeys };
});
