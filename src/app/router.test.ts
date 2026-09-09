import { describe, expect, it } from "vitest";
import { pathFromHash } from "./router";

describe("GitHub Pages hash routing", () => {
  it("resolves logical application routes from a static-host-safe hash", () => {
    expect(pathFromHash("#/login")).toBe("/login");
    expect(pathFromHash("#/forgot-password")).toBe("/forgot-password");
  });

  it("falls back when no route hash is present", () => {
    expect(pathFromHash("")).toBe("/");
    expect(pathFromHash("#invalid")).toBe("/");
  });
});
