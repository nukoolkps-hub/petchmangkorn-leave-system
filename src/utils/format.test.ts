import { describe, expect, it } from "vitest";
import { formatBaht } from "./format";

describe("formatBaht", () => {
  it("adds thousand separators and the baht suffix", () => {
    expect(formatBaht(300)).toBe("300 บาท");
    expect(formatBaht(1500)).toBe("1,500 บาท");
  });

  it("shows zero rather than an empty string", () => {
    expect(formatBaht(0)).toBe("0 บาท");
  });

  it("never shows decimals", () => {
    expect(formatBaht(300.4)).toBe("300 บาท");
  });
});
