import { describe, expect, it } from "vitest";
import { monthCalendarGrid } from "./calendar-grid";

describe("monthCalendarGrid", () => {
  it("uses six Monday-first weeks and contains leap day", () => {
    const grid = monthCalendarGrid(2024, 2);
    expect(grid).toHaveLength(42);
    expect(grid[0]?.date).toBe("2024-01-29");
    expect(grid.some((day) => day.date === "2024-02-29")).toBe(true);
  });

  it("crosses the December to January boundary", () => {
    const grid = monthCalendarGrid(2026, 12);
    expect(grid.some((day) => day.date === "2027-01-01")).toBe(true);
  });
});
