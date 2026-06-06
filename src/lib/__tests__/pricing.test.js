import { describe, expect, it } from "vitest";
import { formatPrice } from "../pricing";

describe("formatPrice", () => {
  it("returns 'N/A' for empty string", () => {
    expect(formatPrice("")).toBe("N/A");
  });

  it("returns 'N/A' for NaN values", () => {
    expect(formatPrice("not a number")).toBe("N/A");
  });

  it("returns 'Free' for zero", () => {
    expect(formatPrice(0)).toBe("Free");
    expect(formatPrice("0")).toBe("Free");
    expect(formatPrice("0.0")).toBe("Free");
    expect(formatPrice("0.000000")).toBe("Free");
  });

  it("formats integer prices with .00 suffix", () => {
    expect(formatPrice(5)).toBe("$5.00");
    expect(formatPrice("12")).toBe("$12.00");
  });

  it("preserves non-zero decimals up to 6 places", () => {
    expect(formatPrice("0.123456")).toBe("$0.123456");
  });

  it("removes leading zeros from the whole part", () => {
    expect(formatPrice("0012.50")).toBe("$12.50");
    expect(formatPrice("00005")).toBe("$5.00");
  });

  it("pads short fractions to at least 2 chars", () => {
    expect(formatPrice("5.5")).toBe("$5.50");
    expect(formatPrice("5")).toBe("$5.00");
  });

  it("truncates fractions longer than 6 chars", () => {
    // The function takes the first 6 digits
    expect(formatPrice("5.1234567890")).toBe("$5.123456");
  });

  it("strips trailing zeros from the fraction (but keeps at least 2)", () => {
    expect(formatPrice("5.10000")).toBe("$5.10");
    expect(formatPrice("5.000001")).toBe("$5.000001");
  });

  it("handles whole-number values expressed as strings", () => {
    expect(formatPrice("7")).toBe("$7.00");
  });

  it("handles input that is a number", () => {
    expect(formatPrice(3.5)).toBe("$3.50");
    expect(formatPrice(10.99)).toBe("$10.99");
  });

  it("returns '$0.00' stripped to 'Free' (the only zero case)", () => {
    expect(formatPrice("0.00")).toBe("Free");
  });
});
