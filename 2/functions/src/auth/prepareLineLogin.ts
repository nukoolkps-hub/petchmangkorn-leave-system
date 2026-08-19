/**
 * prepareLineLogin — generate server-side OAuth state token
 *
 * Server-side CSRF defense ที่แข็งกว่า client-only state check:
 * - random 32 bytes ผ่าน Node crypto (cryptographically secure)
 * - เก็บใน loginStates/{state} doc · single-use · TTL 10 นาที
 * - lineAuth จะ validate + delete state ใน transaction (atomic)
 *
 * Client ยังเก็บ state ใน sessionStorage เพื่อ defense-in-depth (กัน
 * race ระหว่าง browser tabs) แต่ source of truth คือ server doc
 */

import { randomBytes } from "node:crypto";
import { onCall } from "firebase-functions/v2/https";
import { getAppFirestore } from "../helpers/config.js";

export const LINE_LOGIN_STATE_TTL_MS = 10 * 60 * 1000; // 10 นาที

export const prepareLineLogin = onCall(async () => {
	const state = randomBytes(32).toString("base64url");
	const now = Date.now();
	const db = getAppFirestore();
	await db.collection("loginStates").doc(state).set({
		createdAt: now,
		expiresAt: now + LINE_LOGIN_STATE_TTL_MS,
	});
	return { state };
});
