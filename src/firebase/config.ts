/* ─── Firebase Configuration ────────────────────────────────────
   - dev:  ใช้ mock Firebase project สำหรับ emulator (firebaseConfig.json)
   - prod: อ่านจาก build-time env (VITE_FIREBASE_*) — ดู .env.example

   ตั้งค่า production:
   - local build : ใส่ค่าใน .env.production.local
   - CI/CD       : GitHub Secrets + .github/workflows/deploy.yml      */

import { type FirebaseOptions, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  initializeFirestore,
} from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { connectStorageEmulator, getStorage } from "firebase/storage";
import firebaseConfigs from "./firebaseConfig.json";

type FirebaseRuntimeConfig = {
  firebaseConfig: FirebaseOptions;
  firestoreDatabaseId: string;
};

const productionRuntimeConfig: FirebaseRuntimeConfig = {
  firebaseConfig: {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  },
  firestoreDatabaseId:
    import.meta.env.VITE_FIRESTORE_DATABASE_ID || "petchmangkorn-bot",
};

const firebaseRuntimeConfig: FirebaseRuntimeConfig = import.meta.env.PROD
  ? productionRuntimeConfig
  : firebaseConfigs.development;

export const firebaseConfig = firebaseRuntimeConfig.firebaseConfig;
export const FIRESTORE_DATABASE_ID = firebaseRuntimeConfig.firestoreDatabaseId;
export const FIREBASE_PROJECT_ID = firebaseConfig.projectId || "";

// Validate config — warn user ถ้าลืมตั้งค่าใน JSON
const requiredFirebaseKeys = [
  "apiKey",
  "authDomain",
  "projectId",
  "storageBucket",
  "messagingSenderId",
  "appId",
] as const;
const missingKeys = requiredFirebaseKeys.filter((key) => !firebaseConfig[key]);
if (missingKeys.length > 0) {
  console.warn(
    "[Firebase] Missing config keys:",
    missingKeys,
    "\nตรวจสอบ src/firebase/firebaseConfig.json",
  );
}

export const app = initializeApp(firebaseConfig);
/* ─── Firestore transport ──────────────────────────────────────
   ในเบราว์เซอร์ default Firestore ใช้ WebChannel (bidi long-poll).
   LINE in-app browser (LIFF WebView) บล็อก keep-alive ของ WebChannel
   บ่อย → connection ดู open แต่ data ไม่ไหล → onSnapshot ค้าง
   forever → user ค้างหน้า loading screen ตลอด.
   experimentalAutoDetectLongPolling ให้ SDK ตรวจจับเอง ถ้า WebChannel
   ใช้ไม่ได้ → fallback ไป long-polling ปกติ                          */
export const db = initializeFirestore(
  app,
  { experimentalAutoDetectLongPolling: true },
  FIRESTORE_DATABASE_ID,
);
export const auth = getAuth(app);
export const functions = getFunctions(app, "asia-southeast1");
export const storage = getStorage(app);

/* ─── Emulator connections (dev only) ──────────────────────────
   เปิดอัตโนมัติตอน `npm run dev`
   ปิดได้ด้วย VITE_USE_EMULATORS=false ใน .env.local
   เปิดตอน production ได้ด้วย VITE_USE_EMULATORS=true (ไม่แนะนำ) */
const useEmulators =
  import.meta.env.VITE_USE_EMULATORS === "true" ||
  (import.meta.env.VITE_USE_EMULATORS !== "false" && import.meta.env.DEV);

if (useEmulators) {
  console.log("🔧 Firebase Emulators: connecting to local emulators…");
  connectFirestoreEmulator(db, "localhost", 8080);
  connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
  connectFunctionsEmulator(functions, "localhost", 5001);
  connectStorageEmulator(storage, "localhost", 9199);
}

/* ─── Collection paths (ใช้ที่นี่ที่เดียว) ────────────────────── */
export const COLLECTIONS = {
  EMPLOYEES: "employees",
  LEAVES: "leaves",
  SALARIES: "salaries", // /salaries/{employeeId}/months/{yearMonth}
  ADVANCES: "advances",
  ROLES: "roles",
  PAYROLL_CONFIRMS: "payrollConfirms",
  // Admin ใส่ "เงินกู้" ที่ผ่อนคืนหักเงินเดือนเดือนละ X (แยกจากเบิกล่วงหน้า)
  POOL_ADJUSTMENTS: "poolAdjustments",
  EMPLOYEE_LOANS: "employeeLoans",
};
