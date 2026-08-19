/**
 * bootstrapAdmin — one-time first-admin promotion.
 *
 * This does not create an employee document. The caller must already be
 * authenticated, and must provide the server-configured setup secret.
 */

import { getAuth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
	getAppFirestore,
	getLineConfig,
	isConfiguredAdminLineUser,
} from "../helpers/config.js";
import { parseBootstrapAdminPayload } from "../helpers/payload.js";

const BOOTSTRAP_MARKER_PATH = "system/adminBootstrap";

export const bootstrapAdmin = onCall(async (request) => {
	if (!request.auth) throw new HttpsError("unauthenticated", "ต้อง login ก่อน");

	const expectedSecret = process.env.ADMIN_BOOTSTRAP_SECRET?.trim();
	if (!expectedSecret) {
		throw new HttpsError(
			"failed-precondition",
			"ADMIN_BOOTSTRAP_SECRET is not configured",
		);
	}

	const { setupSecret } = parseBootstrapAdminPayload(request.data);
	if (setupSecret !== expectedSecret) {
		throw new HttpsError("permission-denied", "Invalid setup secret");
	}

	const uid = request.auth.uid;
	const db = getAppFirestore();

	// Defense in depth: ถ้า ADMIN_LINE_USER_ID ถูกตั้งไว้แล้ว → uid ต้องตรงกับ
	// คนใน allowlist (uid ใน LINE auth flow = profile.userId). กันความเสี่ยง
	// secret หลุดแล้ว user ที่ไม่ใช่ admin ของจริง bootstrap ตัวเองได้. ถ้ายัง
	// ไม่ตั้ง allowlist (true first-time setup) → ปล่อย bypass ผ่าน secret
	const lineConfig = await getLineConfig().catch(
		() => ({}) as Record<string, unknown>,
	);
	const adminAllowlist = (lineConfig as { ADMIN_LINE_USER_ID?: string })
		.ADMIN_LINE_USER_ID;
	if (adminAllowlist && adminAllowlist.trim()) {
		if (!isConfiguredAdminLineUser(uid, adminAllowlist)) {
			throw new HttpsError(
				"permission-denied",
				"บัญชีนี้ไม่อยู่ในรายการแอดมิน (ADMIN_LINE_USER_ID)",
			);
		}
	}
	const markerRef = db.doc(BOOTSTRAP_MARKER_PATH);
	const linkedEmployee = await db
		.collection("employees")
		.where("lineUserId", "==", uid)
		.limit(1)
		.get();
	if (!linkedEmployee.empty) {
		throw new HttpsError(
			"failed-precondition",
			"บัญชีนี้ถูกผูกกับพนักงานแล้ว ไม่สามารถใช้เป็นผู้ดูแลระบบแบบ claim-only",
		);
	}

	await db.runTransaction(async (transaction) => {
		const marker = await transaction.get(markerRef);
		if (marker.exists) {
			const markerData = marker.data() as
				| { uid?: string; status?: string }
				| undefined;
			if (markerData?.uid !== uid) {
				throw new HttpsError(
					"already-exists",
					"Admin bootstrap has already been used",
				);
			}
			transaction.update(markerRef, {
				lastAttemptAt: FieldValue.serverTimestamp(),
			});
			return;
		}

		transaction.create(markerRef, {
			uid,
			status: "pending",
			createdAt: FieldValue.serverTimestamp(),
			lastAttemptAt: FieldValue.serverTimestamp(),
		});
	});

	const auth = getAuth();
	let customClaims: Record<string, unknown> = {};
	try {
		const user = await auth.getUser(uid);
		customClaims = user.customClaims || {};
	} catch (error) {
		const code = (error as { code?: string }).code;
		if (code !== "auth/user-not-found") throw error;
		await auth.createUser({ uid });
	}
	await auth.setCustomUserClaims(uid, {
		...customClaims,
		admin: true,
	});

	const customToken = await auth.createCustomToken(uid, { admin: true });

	await markerRef.set(
		{
			uid,
			status: "complete",
			completedAt: FieldValue.serverTimestamp(),
		},
		{ merge: true },
	);

	return { ok: true, uid, admin: true, customToken };
});
