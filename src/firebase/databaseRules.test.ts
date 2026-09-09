import { describe, expect, it } from "vitest";
import rules from "../../database.rules.json";

describe("Realtime Database rule posture", () => {
  it("denies access by default and scopes user access to auth.uid", () => {
    expect(rules.rules[".read"]).toBe(false);
    expect(rules.rules[".write"]).toBe(false);
    expect(rules.rules.users.$uid[".read"]).toContain("auth.uid === $uid");
    expect(rules.rules.users.$uid[".write"]).toContain("auth.uid === $uid");
  });

  it("rejects unknown profile fields and uses server-time validation", () => {
    expect(rules.rules.users.$uid.profile.$other[".validate"]).toBe(false);
    expect(rules.rules.users.$uid.profile.createdAt[".validate"]).toContain("now");
    expect(rules.rules.users.$uid.profile.updatedAt[".validate"]).toContain("now");
  });
});
