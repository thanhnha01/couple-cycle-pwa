import { describe, expect, it } from "vitest";
import { suggestedHolidays, vietnamHolidays } from "./vietnamHolidays";

describe("vietnamHolidays", () => {
  it("creates stable solar-calendar suggestions", () => {
    expect(vietnamHolidays(2026).find((holiday) => holiday.title === "Quốc khánh")?.date).toBe("2026-09-02");
    expect(suggestedHolidays("2026-12-25" as never)[0]?.date).toBe("2027-01-01");
  });
});
