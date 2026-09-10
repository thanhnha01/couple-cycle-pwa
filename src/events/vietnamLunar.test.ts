import { describe, expect, it } from "vitest";
import { lunarToSolar } from "./vietnamLunar";

describe("Vietnamese lunar calendar", () => {
  it("calculates Tết dates in known years", () => { expect(lunarToSolar(1, 1, 2024)).toBe("2024-02-10"); expect(lunarToSolar(1, 1, 2025)).toBe("2025-01-29"); });
  it("calculates Giỗ Tổ Hùng Vương", () => { expect(lunarToSolar(10, 3, 2024)).toBe("2024-04-18"); expect(lunarToSolar(10, 3, 2025)).toBe("2025-04-07"); });
});
