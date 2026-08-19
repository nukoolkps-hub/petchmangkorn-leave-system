/* ─── Admin Operations (via Cloud Functions) ─────────────────
   Custom Claims (admin role) ตั้งได้เฉพาะจาก Firebase Admin SDK
   ดังนั้นต้องผ่าน Cloud Function                                  */

import { signInWithCustomToken } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "./config";

const setAdminFn = httpsCallable(functions, "setAdmin");
const bootstrapAdminFn = httpsCallable(functions, "bootstrapAdmin");

export interface BootstrapAdminResult {
  ok?: boolean;
  uid?: string;
  admin?: boolean;
  customToken?: string;
}

/**
 * Promote user เป็น admin
 * @param {string} uid - Firebase UID
 */
export async function setAdminRole(uid: string, isAdmin = true) {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("ต้อง login ก่อน");
  }

  const result = await setAdminFn({ uid, isAdmin });
  return result.data;
}

export async function bootstrapAdmin(setupSecret: string) {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("ต้อง login ก่อน");
  }

  const result = await bootstrapAdminFn({ setupSecret });
  const data = result.data as BootstrapAdminResult;

  if (data.customToken) {
    const credential = await signInWithCustomToken(auth, data.customToken);
    const tokenResult = await credential.user.getIdTokenResult(true);
    return { ...data, admin: tokenResult.claims.admin === true };
  }

  await currentUser.getIdToken(true);
  const tokenResult = await currentUser.getIdTokenResult(true);
  return { ...data, admin: tokenResult.claims.admin === true };
}

/**
 * Force refresh current user's token to get latest claims
 * เรียกหลังจาก setAdminRole() เพื่อให้ frontend เห็นการเปลี่ยนแปลงทันที
 */
export async function refreshIdToken() {
  const user = auth.currentUser;
  if (!user) return;
  await user.getIdToken(true); // force refresh
}
