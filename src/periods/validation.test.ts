import { describe, expect, it } from "vitest";
import { calendarDate, timestamp } from "../utils/date";
import type { Period } from "../cycle/types";
import { findPeriodContaining, validatePeriodInput } from "./validation";

function period(id: string, startDate: string, endDate: string): Period {
  return { id, coupleId: "couple", startDate: calendarDate(startDate), endDate: calendarDate(endDate), createdAt: timestamp(1), createdBy: "a", updatedAt: timestamp(1), updatedBy: "a", revision: 1 };
}

describe("period lookup and validation", () => {
  it("finds a period from an interior selected date", () => {
    const existing = period("p1", "2026-09-09", "2026-09-13");
    expect(findPeriodContaining([existing], calendarDate("2026-09-11"))).toBe(existing);
  });

  it("rejects duplicate starts, overlaps, and reversed ranges", () => {
    const existing = period("p1", "2026-09-09", "2026-09-13");
    expect(validatePeriodInput({ startDate: calendarDate("2026-09-09"), endDate: calendarDate("2026-09-12") }, [existing]).map((issue) => issue.code)).toContain("DUPLICATE_START");
    expect(validatePeriodInput({ startDate: calendarDate("2026-09-11"), endDate: calendarDate("2026-09-15") }, [existing]).map((issue) => issue.code)).toContain("OVERLAP");
    expect(validatePeriodInput({ startDate: calendarDate("2026-09-14"), endDate: calendarDate("2026-09-13") }, [existing]).map((issue) => issue.code)).toContain("END_BEFORE_START");
  });
});
