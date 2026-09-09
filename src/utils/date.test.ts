import { describe, expect, it } from "vitest";
import { calendarDate, timestamp } from "./date";

describe("calendarDate", () => {
  it("accepts valid DD-MM-YYYY dates", () => {
    expect(calendarDate("29-02-2024")).toBe("29-02-2024");
  });

  it("rejects other formats and impossible dates", () => {
    expect(() => calendarDate("2024-02-29")).toThrow(/DD-MM-YYYY/);
    expect(() => calendarDate("31-02-2024")).toThrow(/valid date/);
  });
});

describe("timestamp", () => {
  it("keeps timestamps separate as numeric milliseconds", () => {
    expect(timestamp(1_725_840_000_000)).toBe(1_725_840_000_000);
  });
});
