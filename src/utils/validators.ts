/* ─── Input validation helpers ──────────────────────────────────── */
import { VALIDATION } from "../constants";

/**
 * Validate LINE User ID format
 * @returns {string|null} error message ในภาษาไทย หรือ null ถ้าผ่าน
 */
export function validateLineUserId(value) {
  if (!value?.trim()) return null; // optional field
  const trimmed = value.trim();
  if (!VALIDATION.LINE_USER_ID_PATTERN.test(trimmed)) {
    return "LINE User ID ต้องขึ้นต้นด้วย U และตามด้วยตัวอักษร 32 ตัว";
  }
  return null;
}

/**
 * Validate non-negative number
 * @returns {string|null} error message หรือ null
 */
export function validateNonNegativeNumber(value, fieldName = "ค่า") {
  if (value === "" || value === null || value === undefined) return null;
  const num = parseFloat(value);
  if (Number.isNaN(num)) return `${fieldName}ต้องเป็นตัวเลข`;
  if (num < 0) return `${fieldName}ต้องไม่ติดลบ`;
  return null;
}

/**
 * Validate positive number (must be > 0)
 */
export function validatePositiveNumber(value, fieldName = "ค่า") {
  if (value === "" || value === null || value === undefined) return null;
  const num = parseFloat(value);
  if (Number.isNaN(num)) return `${fieldName}ต้องเป็นตัวเลข`;
  if (num <= 0) return `${fieldName}ต้องมากกว่า 0`;
  return null;
}

/**
 * Validate required text field
 */
export function validateRequired(value, fieldName = "ฟิลด์นี้") {
  if (!value || !String(value).trim()) return `กรุณาระบุ${fieldName}`;
  return null;
}
