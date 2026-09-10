import { describe, expect, it } from "vitest";
import rules from "../../database.rules.json";

describe("Realtime Database rule posture", () => {
  it("denies access by default and scopes user data to auth.uid", () => {
    expect(rules.rules[".read"]).toBe(false);
    expect(rules.rules[".write"]).toBe(false);
    expect(rules.rules.users.$uid[".read"]).toContain("auth.uid === $uid");
    expect(rules.rules.users.$uid.profile[".write"]).toContain("auth.uid === $uid");
    expect(rules.rules.users.$uid.coupleId[".write"]).toContain("members");
  });

  it("rejects unknown profile fields and uses server-time validation", () => {
    expect(rules.rules.users.$uid.profile.$other[".validate"]).toBe(false);
    expect(rules.rules.users.$uid.profile.createdAt[".validate"]).toContain("now");
    expect(rules.rules.users.$uid.profile.updatedAt[".validate"]).toContain("now");
  });

  it("uses membership for couple reads and owner state for invite management", () => {
    expect(rules.rules.couples.$coupleId[".read"]).toContain("members");
    expect(rules.rules.couples.$coupleId.invite[".write"]).toContain("'owner'");
    expect(rules.rules.couples.$coupleId.members.$memberUid.role[".validate"]).toContain("'member'");
  });

  it("caps membership and requires an invite claim for joining", () => {
    expect(rules.rules.couples.$coupleId[".write"]).toContain("memberCount");
    expect(rules.rules.couples.$coupleId[".write"]).toContain("inviteClaims");
    expect(rules.rules.couples.$coupleId.profile.memberCount[".validate"]).toContain("newData.val() === 2");
  });

  it("grants period access only to couple members and validates period revisions", () => {
    const periods = rules.rules.couples.$coupleId.periods;
    expect(periods[".read"]).toContain("members");
    expect(periods.$periodId[".write"]).toContain("members");
    expect(periods.$periodId.revision[".validate"]).toContain("data.val() + 1");
    expect(periods.$periodId.mutationId[".validate"]).toContain("newData.isString()");
  });

  it("isolates presence writes to the current member and requires server timestamps", () => {
    const presence = rules.rules.couples.$coupleId.presence.$uid;
    expect(presence[".write"]).toContain("auth.uid === $uid");
    expect(presence[".write"]).toContain("members");
    expect(presence.lastSeenAt[".validate"]).toContain("=== now");
    expect(presence.updatedAt[".validate"]).toContain("=== now");
  });

  it("limits memories and checklist entries to couple members with validated schema", () => {
    const features = rules.rules.couples.$coupleId.features;
    expect(features[".read"]).toContain("members");
    expect(features[".write"]).toContain("members");
    expect(features.memories.$memoryId[".write"]).toContain("members");
    expect(features.memories.$memoryId.createdAt[".validate"]).toContain("now");
    expect(features.checklist.$itemId.completedBy[".validate"]).toContain("auth.uid");
  });
});
