/* ─── Firebase Storage uploads ───────────────────────────────── */

import { getDownloadURL, ref, uploadString } from "firebase/storage";
import { storage } from "./config";

function safeSegment(value: string | number) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "_");
}

async function uploadDataUrl(path: string, dataUrl: string) {
  const fileRef = ref(storage, path);
  await uploadString(fileRef, dataUrl, "data_url");
  return await getDownloadURL(fileRef);
}

export async function uploadAvatar(employeeId: string, dataUrl: string) {
  const id = safeSegment(employeeId);
  return await uploadDataUrl(`avatars/${id}/avatar-${Date.now()}.jpg`, dataUrl);
}
