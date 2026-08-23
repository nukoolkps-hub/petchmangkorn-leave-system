/**
 * Firebase Storage helpers
 */

import { getStorage } from "firebase-admin/storage";

/**
 * Save a base64 data URL to Firebase Storage, return public URL.
 * Returns null if the input is not a valid data URL.
 */
export async function saveSlipToStorage(
	dataURL: string | undefined,
	requestId: string | number,
): Promise<string | null> {
	if (!dataURL?.startsWith("data:image/")) return null;

	const m = dataURL.match(/^data:(image\/\w+);base64,(.+)$/);
	if (!m) return null;

	const ext = m[1].split("/")[1] === "jpeg" ? "jpg" : m[1].split("/")[1];
	const buf = Buffer.from(m[2], "base64");
	const fileName = `slips/slip-${requestId}-${Date.now()}.${ext}`;

	const bucket = getStorage().bucket();
	const file = bucket.file(fileName);
	await file.save(buf, {
		contentType: m[1],
		metadata: { cacheControl: "public, max-age=31536000" },
	});
	await file.makePublic();

	return `https://storage.googleapis.com/${bucket.name}/${fileName}`;
}
