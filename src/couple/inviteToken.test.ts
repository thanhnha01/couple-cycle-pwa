import { describe, expect, it } from "vitest";
import { createInviteToken, isInviteToken } from "./inviteToken";

describe("invite capability tokens", () => {
  it("creates URL-safe 256-bit tokens", () => {
    const token = createInviteToken();
    expect(token).toHaveLength(43);
    expect(isInviteToken(token)).toBe(true);
  });

  it("does not accept short human-readable codes", () => {
    expect(isInviteToken("123456")).toBe(false);
  });
});
