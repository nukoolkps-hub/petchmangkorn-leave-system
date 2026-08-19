import { describe, expect, it } from "vitest";
import { caretPosFromDigits, formatTypedNumber } from "./format";

describe("formatTypedNumber", () => {
  it("passes through empty / partial sentinels unchanged", () => {
    expect(formatTypedNumber("")).toBe("");
    expect(formatTypedNumber("-")).toBe("-");
    expect(formatTypedNumber(".")).toBe(".");
  });

  it("groups the integer part with commas", () => {
    expect(formatTypedNumber("0")).toBe("0");
    expect(formatTypedNumber("1234")).toBe("1,234");
    expect(formatTypedNumber("1234567")).toBe("1,234,567");
  });

  it("keeps the decimal part exactly as typed (incl. a trailing dot)", () => {
    expect(formatTypedNumber("1234.5")).toBe("1,234.5");
    expect(formatTypedNumber("1234.567")).toBe("1,234.567");
    expect(formatTypedNumber("3.")).toBe("3.");
    expect(formatTypedNumber(".5")).toBe(".5");
  });

  it("supports negatives", () => {
    expect(formatTypedNumber("-1234")).toBe("-1,234");
    expect(formatTypedNumber("-1234.5")).toBe("-1,234.5");
  });
});

describe("caretPosFromDigits", () => {
  it("returns 0 for a non-positive digit count", () => {
    expect(caretPosFromDigits("1,234", 0)).toBe(0);
  });

  it("places the caret after the Nth significant char, skipping commas", () => {
    // "1,234" — significant chars 1,2,3,4 at indexes 0,2,3,4
    expect(caretPosFromDigits("1,234", 1)).toBe(1); // after "1"
    expect(caretPosFromDigits("1,234", 2)).toBe(3); // after "2"
    expect(caretPosFromDigits("1,234", 4)).toBe(5); // end
  });

  it("counts the decimal point and minus sign as significant", () => {
    expect(caretPosFromDigits("-1,234.5", 1)).toBe(1); // after "-"
    expect(caretPosFromDigits("1,234.5", 5)).toBe(6); // after the "."
  });

  it("clamps to the string length when digits exceed what's available", () => {
    expect(caretPosFromDigits("1,234", 99)).toBe(5);
  });
});
