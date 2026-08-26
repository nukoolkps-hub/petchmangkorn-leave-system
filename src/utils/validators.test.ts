import { describe, expect, it } from "vitest";
import { validateLineUserId, validateRequired } from "./validators";

const VALID_LINE_ID = `U${"0123456789abcdef".repeat(2)}`; // U + 32 hex chars

describe("validateLineUserId", () => {
  it("accepts an empty value (optional field)", () => {
    expect(validateLineUserId("")).toBeNull();
    expect(validateLineUserId(null)).toBeNull();
    expect(validateLineUserId("   ")).toBeNull();
  });

  it("accepts a well-formed LINE id (U + 32 hex)", () => {
    expect(validateLineUserId(VALID_LINE_ID)).toBeNull();
    expect(validateLineUserId(`  ${VALID_LINE_ID}  `)).toBeNull(); // trimmed
  });

  it("rejects bad formats", () => {
    expect(validateLineUserId("U123")).not.toBeNull(); // too short
    expect(validateLineUserId(`X${"0".repeat(32)}`)).not.toBeNull(); // wrong prefix
    expect(validateLineUserId(`U${"g".repeat(32)}`)).not.toBeNull(); // non-hex
  });
});

describe("validateRequired", () => {
  it("rejects empty / whitespace-only values", () => {
    expect(validateRequired("")).not.toBeNull();
    expect(validateRequired("   ")).not.toBeNull();
    expect(validateRequired(null)).not.toBeNull();
  });

  it("accepts any non-empty string value", () => {
    expect(validateRequired("x")).toBeNull();
    expect(validateRequired("0")).toBeNull();
  });

  it("rejects the number 0 because of the falsy `!value` guard", () => {
    // documents current behavior: 0 is falsy so it is treated as missing
    expect(validateRequired(0)).not.toBeNull();
  });
});
