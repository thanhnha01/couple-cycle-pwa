import { describe, expect, it } from "vitest";
import { loveDayCount, nextLoveMilestone } from "./loveDay";
import { calendarDate } from "../utils/date";

describe("love day", () => {
  it("counts the starting date as day one", () => expect(loveDayCount(calendarDate("2023-03-03"), calendarDate("2023-03-03"))).toBe(1));
  it("finds the next milestone", () => expect(nextLoveMilestone(486)).toBe(500));
  it("moves to yearly milestones after presets", () => expect(nextLoveMilestone(1001)).toBe(1095));
});
