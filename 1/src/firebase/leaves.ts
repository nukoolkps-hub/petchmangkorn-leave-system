/* ─── Leaves CRUD ───────────────────────────────────────────── */
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import type { LeaveEntry } from "../types";
import { COLLECTIONS, db } from "./config";

const ref = collection(db, COLLECTIONS.LEAVES);

/* ─── Real-time subscribe ──────────────────────────────────── */
export function subscribeLeaves(
  onChange: (leaves: LeaveEntry[]) => void,
  onError?: (err: Error) => void,
) {
  return onSnapshot(
    query(ref, orderBy("start", "desc")),
    (snap) => {
      const list = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as LeaveEntry,
      );
      onChange(list);
    },
    (err) => {
      console.error("[Leaves] subscribe error:", err);
      onError?.(err);
    },
  );
}

/* ─── Get all (one-time) ───────────────────────────────────── */
export async function getAllLeaves(): Promise<LeaveEntry[]> {
  const snap = await getDocs(query(ref, orderBy("start", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as LeaveEntry);
}

/* ─── Add new leave ────────────────────────────────────────── */
export async function addLeave(leave: Omit<LeaveEntry, "id">): Promise<string> {
  const docRef = await addDoc(ref, {
    ...leave,
    submitted: leave.submitted || new Date().toLocaleString("th-TH"),
    createdAt: Date.now(),
  });
  return docRef.id;
}

/* ─── Update leave ─────────────────────────────────────────── */
export async function updateLeave(
  id: string,
  fields: Partial<LeaveEntry>,
): Promise<void> {
  await updateDoc(doc(ref, id), {
    ...fields,
    updatedAt: Date.now(),
  });
}

/* ─── Delete leave ─────────────────────────────────────────── */
export async function deleteLeave(id: string | number): Promise<void> {
  await deleteDoc(doc(ref, String(id)));
}
