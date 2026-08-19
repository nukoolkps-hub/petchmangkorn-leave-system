/**
 * lineAuth — LINE Login → Firebase Custom Token
 */

import { getAuth, type Auth, type UserRecord } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
	getAppFirestore,
	getLineConfig,
	isConfiguredAdminLineUser,
} from "../helpers/config.js";
import { parseLineAuthPayload } from "../helpers/payload.js";

const UNPROVISIONED_LINE_USER_MESSAGE =
	"บัญชี LINE นี้ยังไม่ได้ถูกเพิ่มโดยผู้ดูแลระบบ";

/** atomically validate + consume OAuth state · single-use (delete in same txn)
 *  · CSRF defense ฝั่ง server (เพิ่มจาก client sessionStorage check) */
async function consumeLoginState(db: Firestore, state: string): Promise<void> {
	const stateRef = db.collection("loginStates").doc(state);
	await db.runTransaction(async (tx) => {
		const snap = await tx.get(stateRef);
		if (!snap.exists) {
			throw new HttpsError(
				"permission-denied",
				"Invalid or already-used state",
			);
		}
		const data = snap.data() as { createdAt?: number; expiresAt?: number };
		const now = Date.now();
		if (typeof data.expiresAt === "number" && now > data.expiresAt) {
			tx.delete(stateRef);
			throw new HttpsError("permission-denied", "Expired state");
		}
		// single-use — ลบทันทีใน txn เดียวกัน · request ที่ replay มาด้วย state
		// เดิมจะเห็น "not exists" และโดน reject
		tx.delete(stateRef);
	});
}

export const lineAuth = onCall(async (request) => {
	const { code, redirectUri, state } = parseLineAuthPayload(request.data);

	// CSRF defense: validate + consume state ก่อนยุ่งกับ LINE API · กัน
	// attacker forge OAuth callback ไปที่ victim browser
	await consumeLoginState(getAppFirestore(), state);

	const config = await getLineConfig();
	if (!config.LINE_LOGIN_CHANNEL_ID || !config.LINE_LOGIN_CHANNEL_SECRET) {
		throw new HttpsError(
			"failed-precondition",
			"LINE Login not configured in /config/secrets",
		);
	}

	// 1. Exchange code → LINE access_token
	const tokenRes = await fetch("https://api.line.me/oauth2/v2.1/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "authorization_code",
			code,
			redirect_uri: redirectUri,
			client_id: config.LINE_LOGIN_CHANNEL_ID,
			client_secret: config.LINE_LOGIN_CHANNEL_SECRET,
		}),
	});
	const tokenData = (await tokenRes.json()) as { access_token?: string };
	if (!tokenData.access_token) {
		throw new HttpsError("unauthenticated", "Invalid LINE code");
	}

	// 2. Get LINE profile
	const profileRes = await fetch("https://api.line.me/v2/profile", {
		headers: { Authorization: `Bearer ${tokenData.access_token}` },
	});
	const profile = (await profileRes.json()) as {
		userId?: string;
		displayName?: string;
		pictureUrl?: string;
	};
	if (!profile.userId) {
		throw new HttpsError("unauthenticated", "Failed to get LINE profile");
	}

	const auth = getAuth();
	if (isConfiguredAdminLineUser(profile.userId, config.ADMIN_LINE_USER_ID)) {
		const user = await ensureLineAuthUser(
			auth,
			profile.userId,
			profile.displayName,
			profile.pictureUrl,
		);
		await auth.setCustomUserClaims(profile.userId, {
			...(user.customClaims || {}),
			admin: true,
		});

		// ทุกครั้งที่ admin "ของจริง" login เข้ามา ให้กวาด admin claim ที่ค้าง
		// จากคนที่ไม่อยู่ใน ADMIN_LINE_USER_ID อีกแล้วทิ้งให้หมด (เคย bootstrap
		// หรือเคยตั้ง setAdmin ไว้ แต่ตอนนี้ไม่ใช่ admin แล้ว) — ไม่ต้องรอให้
		// user คนนั้น login ใหม่
		await revokeStaleAdminClaims(auth, config.ADMIN_LINE_USER_ID);

		const customToken = await auth.createCustomToken(profile.userId, {
			admin: true,
			provider: "line",
			...(profile.displayName ? { displayName: profile.displayName } : {}),
			...(profile.pictureUrl ? { pictureUrl: profile.pictureUrl } : {}),
		});

		return {
			customToken,
			profile: {
				userId: profile.userId,
				displayName: profile.displayName,
				pictureUrl: profile.pictureUrl,
			},
		};
	}

	try {
		const existing = await auth.getUser(profile.userId);
		// ถ้า claim admin ค้างจากการตั้งครั้งก่อน (เช่นเคยอยู่ใน ADMIN_LINE_USER_ID
		// หรือเคย bootstrap/setAdmin) แต่ตอนนี้ไม่ใช่ admin แล้ว → revoke ทิ้ง
		const existingClaims = existing.customClaims || {};
		if ((existingClaims as { admin?: boolean }).admin === true) {
			const { admin: _droppedAdmin, ...rest } = existingClaims as {
				admin?: boolean;
				[key: string]: unknown;
			};
			await auth.setCustomUserClaims(profile.userId, rest);
			// บังคับให้ refresh token ครั้งต่อไป → token เก่าที่ยังถือ admin: true
			// จะใช้งาน Firestore rules แบบ admin ไม่ได้อีกหลังหมดอายุ (~1 ชม.)
			await auth.revokeRefreshTokens(profile.userId);
		}
	} catch (error) {
		if ((error as { code?: string }).code === "auth/user-not-found") {
			throw new HttpsError("permission-denied", UNPROVISIONED_LINE_USER_MESSAGE);
		}
		throw error;
	}

	const employeeSnapshot = await getAppFirestore()
		.collection("employees")
		.where("lineUserId", "==", profile.userId)
		.limit(1)
		.get();
	if (employeeSnapshot.empty) {
		throw new HttpsError("permission-denied", UNPROVISIONED_LINE_USER_MESSAGE);
	}

	// 3. Create Firebase Custom Token for a provisioned LINE user
	const customToken = await auth.createCustomToken(profile.userId, {
		provider: "line",
		...(profile.displayName ? { displayName: profile.displayName } : {}),
		...(profile.pictureUrl ? { pictureUrl: profile.pictureUrl } : {}),
	});

	return {
		customToken,
		profile: {
			userId: profile.userId,
			displayName: profile.displayName,
			pictureUrl: profile.pictureUrl,
		},
	};
});

/**
 * กวาด admin custom claim จาก user ที่ไม่ได้อยู่ใน ADMIN_LINE_USER_ID
 * รองรับสูงสุด 1000 users ต่อ batch (เพียงพอสำหรับร้านเล็ก)
 */
async function revokeStaleAdminClaims(
	auth: Auth,
	configValue: string | undefined,
): Promise<void> {
	const allowedAdminIds = new Set(
		configValue
			?.split(/[,\s]+/)
			.map((value) => value.trim())
			.filter(Boolean) || [],
	);

	try {
		const { users } = await auth.listUsers(1000);
		let revokedCount = 0;
		for (const user of users) {
			const claims = (user.customClaims || {}) as {
				admin?: boolean;
				[key: string]: unknown;
			};
			if (claims.admin === true && !allowedAdminIds.has(user.uid)) {
				const { admin: _droppedAdmin, ...rest } = claims;
				await auth.setCustomUserClaims(user.uid, rest);
				await auth.revokeRefreshTokens(user.uid);
				revokedCount++;
				console.log(
					`[revokeStaleAdminClaims] revoked admin claim from ${user.uid}`,
				);
			}
		}
		if (revokedCount > 0) {
			console.log(
				`[revokeStaleAdminClaims] cleaned up ${revokedCount} stale admin(s)`,
			);
		}
	} catch (err) {
		// ไม่ throw — ถ้า scan fail อย่างน้อย admin จริงยัง login ได้ปกติ
		console.error("[revokeStaleAdminClaims] scan failed:", err);
	}
}

async function ensureLineAuthUser(
	auth: Auth,
	uid: string,
	displayName: string | undefined,
	photoURL: string | undefined,
): Promise<UserRecord> {
	const profileUpdate = {
		...(displayName ? { displayName } : {}),
		...(photoURL ? { photoURL } : {}),
	};

	try {
		const user = await auth.getUser(uid);
		if (Object.keys(profileUpdate).length > 0) {
			await auth.updateUser(uid, profileUpdate);
			return auth.getUser(uid);
		}
		return user;
	} catch (error) {
		if ((error as { code?: string }).code !== "auth/user-not-found") {
			throw error;
		}
		return auth.createUser({ uid, ...profileUpdate });
	}
}
