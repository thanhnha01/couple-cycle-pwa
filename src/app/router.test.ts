import { describe, expect, it } from "vitest";
import { pathFromHash, queryFromHash } from "./router";

describe("GitHub Pages hash routing", () => {
  it("resolves logical application routes from a static-host-safe hash", () => {
    expect(pathFromHash("#/login")).toBe("/login");
    expect(pathFromHash("#/forgot-password")).toBe("/forgot-password");
    expect(pathFromHash("#/onboarding?couple=A&invite=token")).toBe("/onboarding");
  });

  it("falls back when no route hash is present", () => {
    expect(pathFromHash("")).toBe("/");
    expect(pathFromHash("#invalid")).toBe("/");
  });

  it("retains invite parameters separately from the static route", () => {
    const query = queryFromHash("#/onboarding?couple=owner-a&invite=secret-token");
    expect(query.get("couple")).toBe("owner-a");
    expect(query.get("invite")).toBe("secret-token");
  });
});
