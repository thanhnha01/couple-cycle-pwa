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

  it("keeps an authenticated user without a couple in onboarding", () => {
    const session = { status: "authenticated" as const, user: { uid: "a", email: "a@example.com", displayName: null } };
    expect(guardedDestination("/home", session, { status: "unlinked" })).toBe("/onboarding");
    expect(guardedDestination("/onboarding", session, { status: "unlinked" })).toBeUndefined();
  });

  it("sends an authenticated couple member home from onboarding", () => {
    const session = { status: "authenticated" as const, user: { uid: "a", email: "a@example.com", displayName: null } };
    expect(guardedDestination("/onboarding", session, {
      status: "linked",
      membership: {
        coupleId: "a",
        profile: { name: "Our space", createdAt: 1 as never, ownerUid: "a", memberCount: 1 },
        member: { role: "owner", joinedAt: 1 as never },
      },
    })).toBe("/home");
  });
});
