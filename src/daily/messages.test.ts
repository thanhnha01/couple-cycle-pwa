import { describe, expect, it } from "vitest";
import { dailyCoupleMessage } from "./messages";
import { calendarDate } from "../utils/date";

describe("daily couple message", () => {
  it("is stable for both members", () => expect(dailyCoupleMessage("couple-a", calendarDate("2026-09-10"))).toBe(dailyCoupleMessage("couple-a", calendarDate("2026-09-10"))));
});
