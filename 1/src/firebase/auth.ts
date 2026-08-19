/* ─── Authentication ────────────────────────────────────────────
   Firebase Auth — รองรับ:
   ✅ Google Sign-in (พร้อมใช้)
   ✅ LINE Login (ผ่าน Cloud Function)
   ✅ Email/Password (สำหรับ admin)                                */

import {
  signOut as fbSignOut,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "./config";

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

const lineAuthFn = httpsCallable(functions, "lineAuth");
const prepareLineLoginFn = httpsCallable(functions, "prepareLineLogin");
const devAuthFn = httpsCallable(functions, "devAuth");
const seedLineConfigFromEnvFn = httpsCallable(
  functions,
  "seedLineConfigFromEnv",
);

export type DevRole = "employee" | "admin" | "setup";

export type SeedLineConfigResult = {
  ok: boolean;
  skipped?: boolean;
  seededKeys: string[];
};

/* ─── Google Sign-in ────────────────────────────────────────── */
export async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user; // { uid, email, displayName, photoURL }
  } catch (err: unknown) {
    const e = err as { code?: string };
    console.error("[Auth] Google sign-in failed:", err);
    throw new Error(
      e.code === "auth/popup-closed-by-user"
        ? "ยกเลิกการลงชื่อเข้าใช้"
        : "ลงชื่อเข้าใช้ไม่สำเร็จ",
    );
  }
}

/* ─── LINE Login (full flow) ─────────────────────────────────
   ขั้นที่ 1: ขอ state จาก server → redirect → LINE Login URL
   - state ออกโดย Cloud Function prepareLineLogin · เก็บใน Firestore
     loginStates/{state} (single-use · TTL 10 นาที)
   - client เก็บ sessionStorage copy เพื่อ defense-in-depth (กัน race
     ระหว่าง tabs · backup CSRF check)                              */
export async function startLineLogin({ channelId, redirectUri }) {
  if (!channelId || !redirectUri) {
    throw new Error("Missing LINE channelId or redirectUri");
  }
  // 1. request state จาก server ก่อน — กัน CSRF ฝั่ง server
  const stateRes = await prepareLineLoginFn();
  const state = (stateRes.data as { state?: string })?.state;
  if (!state) {
    throw new Error("Failed to prepare LINE login state");
  }

  // 2. เก็บ copy ใน sessionStorage เพื่อ defense-in-depth (client-side check)
  sessionStorage.setItem("line_login_state", state);

  // 3. redirect ไป LINE authorize URL พร้อม state เดียวกัน
  const url = new URL("https://access.line.me/oauth2/v2.1/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", channelId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", "profile openid");
  window.location.href = url.toString();
}

/**
 * ขั้นที่ 2: หลัง LINE redirect กลับมา (frontend callback page)
 * ส่ง code → Cloud Function → ได้ Firebase Custom Token → sign in
 *
 * @returns {Promise<User>}
 */
export async function completeLineLogin() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const state = params.get("state");
  const error = params.get("error");

  if (error) {
    throw new Error(`LINE Login error: ${error}`);
  }
  if (!code) {
    throw new Error("ไม่พบ authorization code จาก LINE");
  }

  // Verify state ฝั่ง client (defense-in-depth · server validate ซ้ำใน lineAuth
  // ผ่าน Firestore transaction · single-use)
  const savedState = sessionStorage.getItem("line_login_state");
  if (state !== savedState) {
    throw new Error("State mismatch — อาจมีคนปลอมแปลง");
  }
  sessionStorage.removeItem("line_login_state");

  // ส่ง code + state → Cloud Function · server consume state ใน Firestore txn
  const redirectUri = window.location.origin + window.location.pathname;
  const result = await lineAuthFn({ code, redirectUri, state });
  const { customToken } = result.data as { customToken: string };

  // Sign in ด้วย custom token
  return signInWithLineToken(customToken);
}

/* ─── Original LINE custom token sign-in ─────────────────── */
export async function signInWithLineToken(customToken) {
  try {
    const result = await signInWithCustomToken(auth, customToken);
    return result.user;
  } catch (err) {
    console.error("[Auth] LINE sign-in failed:", err);
    throw new Error("LINE Login ไม่สำเร็จ — ลองใหม่อีกครั้ง");
  }
}

/* ─── Dev custom token sign-in (emulator only) ─────────────── */
export async function signInWithDevRole(role: DevRole) {
  try {
    const result = await devAuthFn({ role });
    const { customToken } = result.data as { customToken: string };
    const credential = await signInWithCustomToken(auth, customToken);
    return credential.user;
  } catch (err) {
    console.error("[Auth] Dev role sign-in failed:", err);
    throw new Error("Dev Login ไม่สำเร็จ — ตรวจสอบว่า Functions Emulator เปิดอยู่");
  }
}

/* ─── Dev env → Firestore config seed (emulator only) ────────── */
export async function seedLineConfigFromEnv() {
  const result = await seedLineConfigFromEnvFn();
  return result.data as SeedLineConfigResult;
}

/* ─── Email/Password (Admin) ────────────────────────────────── */
export async function signInWithEmail(email, password) {
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    return result.user;
  } catch (err: unknown) {
    const e = err as { code?: string };
    console.error("[Auth] Email sign-in failed:", err);
    throw new Error(
      e.code === "auth/wrong-password" || e.code === "auth/user-not-found"
        ? "อีเมลหรือรหัสผ่านไม่ถูกต้อง"
        : "ลงชื่อเข้าใช้ไม่สำเร็จ",
    );
  }
}

/* ─── Sign Out ──────────────────────────────────────────────── */
export async function signOut() {
  await fbSignOut(auth);
}

/* ─── Listen to auth state changes ──────────────────────────── */
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}
