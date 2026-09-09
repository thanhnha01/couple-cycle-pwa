import { describe, expect, it } from "vitest";
import { guardedDestination } from "./routeGuards";

describe("route guards", () => {
  it("redirects unauthenticated protected routes to login", () => {
    expect(guardedDestination("/calendar", { status: "unauthenticated" })).toBe("/login");
  });

  it("redirects authenticated auth routes to onboarding", () => {
    expect(guardedDestination("/register", {
      status: "authenticated",
      user: { uid: "a", email: "a@example.com", displayName: null },
    })).toBe("/onboarding");
  });

  it("does not redirect while initial auth is unresolved", () => {
    expect(guardedDestination("/home", { status: "initializing" })).toBeUndefined();
  });
});
