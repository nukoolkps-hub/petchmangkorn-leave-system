/* ─── Image Utilities ───────────────────────────────────────────
   Helpers สำหรับ:
   - resize ภาพก่อน upload (กัน Firestore 1MB limit)
   - compress JPEG quality
   - convert file → base64
   - validate file type/size                                       */

/** Max file size to attempt (8MB) — ใหญ่กว่านี้แสดงว่าไฟล์ผิดประเภท */
const MAX_INPUT_SIZE = 8 * 1024 * 1024;

/** Target file types */
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/**
 * Validate file type and size
 * @returns error message หรือ null ถ้าผ่าน
 */
export function validateImageFile(file: File): string | null {
  if (!file) return "ไม่พบไฟล์";
  if (!ALLOWED_TYPES.includes(file.type)) {
    return "รองรับเฉพาะ JPG, PNG, WEBP, GIF";
  }
  if (file.size > MAX_INPUT_SIZE) {
    return `ไฟล์ใหญ่เกินไป (${(file.size / 1024 / 1024).toFixed(1)}MB) — สูงสุด 8MB`;
  }
  return null;
}

interface ResizeOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  maxBytes?: number;
}

/**
 * Resize image และ return เป็น base64 dataURL
 */
export async function resizeImage(
  file: File,
  opts: ResizeOptions = {},
): Promise<string> {
  const {
    maxWidth = 800,
    maxHeight = 800,
    quality = 0.85,
    maxBytes = 700 * 1024, // 700KB — ปลอดภัยใต้ Firestore 1MB
  } = opts;

  const validationError = validateImageFile(file);
  if (validationError) throw new Error(validationError);

  // อ่านไฟล์ → Image element
  const avatarImageUrl = await loadImage(file);

  // คำนวณขนาดใหม่ (รักษาสัดส่วน)
  let { width, height } = calculateDimensions(
    avatarImageUrl.width,
    avatarImageUrl.height,
    maxWidth,
    maxHeight,
  );

  // วาดลง canvas
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(avatarImageUrl, 0, 0, width, height);

  // ลด quality จนกว่าจะใต้ maxBytes (max 4 รอบ)
  let q = quality;
  let dataUrl = canvas.toDataURL("image/jpeg", q);

  for (let i = 0; i < 4 && estimateBase64Bytes(dataUrl) > maxBytes; i++) {
    q -= 0.15;
    if (q < 0.3) break;
    dataUrl = canvas.toDataURL("image/jpeg", q);
  }

  // ถ้ายังใหญ่ → ลดขนาดอีก
  if (estimateBase64Bytes(dataUrl) > maxBytes) {
    width = Math.round(width * 0.75);
    height = Math.round(height * 0.75);
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(avatarImageUrl, 0, 0, width, height);
    dataUrl = canvas.toDataURL("image/jpeg", 0.75);
  }

  return dataUrl;
}

/**
 * Resize avatar (สี่เหลี่ยมจัตุรัส, เล็ก)
 */
export async function resizeAvatar(file: File): Promise<string> {
  return resizeImage(file, {
    maxWidth: 256,
    maxHeight: 256,
    quality: 0.85,
    maxBytes: 100 * 1024, // 100KB — avatar รูปเล็ก
  });
}

/**
 * Resize slip (สลิปการโอน) — กว้างกว่า + คุณภาพดี
 */
export async function resizeSlip(file: File): Promise<string> {
  return resizeImage(file, {
    maxWidth: 1000,
    maxHeight: 1400,
    quality: 0.88,
    maxBytes: 700 * 1024,
  });
}

/* ─── Internal helpers ───────────────────────────────────────── */

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const avatarImageUrl = new Image();
    const url = URL.createObjectURL(file);
    avatarImageUrl.onload = () => {
      URL.revokeObjectURL(url);
      resolve(avatarImageUrl);
    };
    avatarImageUrl.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("โหลดรูปไม่ได้ — ไฟล์อาจเสีย"));
    };
    avatarImageUrl.src = url;
  });
}

function calculateDimensions(
  srcW: number,
  srcH: number,
  maxW: number,
  maxH: number,
) {
  let width = srcW;
  let height = srcH;
  if (width > maxW) {
    height = Math.round((height * maxW) / width);
    width = maxW;
  }
  if (height > maxH) {
    width = Math.round((width * maxH) / height);
    height = maxH;
  }
  return { width, height };
}

/** Estimate decoded bytes from base64 string */
function estimateBase64Bytes(dataUrl: string): number {
  // base64 strips ~33% overhead
  const base64 = dataUrl.split(",")[1] || "";
  return Math.ceil(base64.length * 0.75);
}

/* ─── Format byte count for display ────────────────────────── */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
