import { describe, expect, it, vi } from "vitest";
import { timestamp } from "../utils/date";
import type { CoupleApplicationService } from "./contracts";
import { CoupleSessionStore } from "./session";
import type { CoupleMembership, InviteDetails } from "./types";

const membership: CoupleMembership = {
  coupleId: "owner-a",
  profile: { name: "Our space", createdAt: timestamp(1), ownerUid: "owner-a", memberCount: 1 },
  member: { role: "owner", joinedAt: timestamp(1) },
};

class SessionCouples implements CoupleApplicationService {
  findMembership = vi.fn(async (): Promise<CoupleMembership | null> => membership);
  createCouple(): Promise<{ membership: CoupleMembership; invite: InviteDetails }> { throw new Error("not used"); }
  joinCouple(): Promise<CoupleMembership> { throw new Error("not used"); }
  regenerateInvite(): Promise<InviteDetails> { throw new Error("not used"); }
  getOwnerInvite(): Promise<InviteDetails> { throw new Error("not used"); }
}

describe("CoupleSessionStore", () => {
  it("resolves verified membership", async () => {
    const couples = new SessionCouples();
    const store = new CoupleSessionStore(couples);
    await store.load("owner-a");
    expect(store.snapshot).toEqual({ status: "linked", membership });
  });

  it("resolves an authenticated user without a couple", async () => {
    const couples = new SessionCouples();
    couples.findMembership.mockResolvedValueOnce(null);
    const store = new CoupleSessionStore(couples);
    await store.load("new-user");
    expect(store.snapshot).toEqual({ status: "unlinked" });
  });

  it("does not let a stale membership request replace a newer one", async () => {
    const couples = new SessionCouples();
    let release: ((value: CoupleMembership | null) => void) | undefined;
    couples.findMembership.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    couples.findMembership.mockResolvedValueOnce(null);
    const store = new CoupleSessionStore(couples);
    const stale = store.load("old-user");
    await store.load("new-user");
    release?.(membership);
    await stale;
    expect(store.snapshot).toEqual({ status: "unlinked" });
  });
});
