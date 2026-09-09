import { describe, expect, it } from "vitest";
import { calendarDate, formatCalendarDate, timestamp } from "./date";

describe("calendarDate", () => {
  it("accepts valid YYYY-MM-DD dates, including leap days", () => {
    expect(calendarDate("2024-02-29")).toBe("2024-02-29");
  });

  it.each(["2025-02-29", "2026-04-31", "2026-01-00"])("rejects invalid days: %s", (value) => {
    expect(() => calendarDate(value)).toThrow(/valid date/);
  });

  it.each(["2026-00-09", "2026-13-09"])("rejects invalid months: %s", (value) => {
    expect(() => calendarDate(value)).toThrow(/valid date/);
  });

  it.each(["09-09-2026", "2026-9-09", "2026-09-9", "2026-09-09T00:00:00Z", "2026-09-09+07:00"])(
    "rejects non-canonical or time-bearing values: %s",
    (value) => {
      expect(() => calendarDate(value)).toThrow(/YYYY-MM-DD/);
    },
  );

  it("sorts chronologically using lexicographical ordering", () => {
    const dates = [calendarDate("2026-12-31"), calendarDate("2026-01-01"), calendarDate("2026-02-01")];
    expect(dates.sort()).toEqual(["2026-01-01", "2026-02-01", "2026-12-31"]);
  });
});

describe("formatCalendarDate", () => {
  it("formats a canonical date for UI display without creating a Date", () => {
    expect(formatCalendarDate(calendarDate("2026-09-09"))).toBe("09/09/2026");
  });
});

describe("timestamp", () => {
  it("keeps timestamps separate as numeric milliseconds", () => {
    expect(timestamp(1_725_840_000_000)).toBe(1_725_840_000_000);
  });
});
