import { describe, expect, it, vi } from "vitest";
import { timestamp } from "../utils/date";
import type { CoupleRepository, CreateCoupleRecord } from "./contracts";
import { CoupleService, INVITE_LIFETIME_MS } from "./service";
import type { CoupleMembership, InviteDetails } from "./types";

const TOKEN_A = "A".repeat(43);
const TOKEN_B = "B".repeat(43);
const membership: CoupleMembership = {
  coupleId: "owner-a",
  profile: { name: "Our space", createdAt: timestamp(1), ownerUid: "owner-a", memberCount: 1 },
  member: { role: "owner", joinedAt: timestamp(1) },
};

class MockCouples implements CoupleRepository {
  findMembership = vi.fn(async (): Promise<CoupleMembership | null> => null);
  create = vi.fn(async (_uid: string, input: CreateCoupleRecord): Promise<{ membership: CoupleMembership; invite: InviteDetails }> => ({
    membership: { ...membership, profile: { ...membership.profile, name: input.name } },
    invite: { coupleId: membership.coupleId, code: input.inviteCode, expiresAt: timestamp(input.expiresAt) },
  }));
  redeem = vi.fn(async (): Promise<CoupleMembership> => ({ ...membership, member: { role: "member", joinedAt: timestamp(2) } }));
  regenerateInvite = vi.fn(async (_uid: string, coupleId: string, code: string, expiresAt: number): Promise<InviteDetails> => ({
    coupleId,
    code,
    expiresAt: timestamp(expiresAt),
  }));
  getOwnerInvite = vi.fn(async (): Promise<InviteDetails> => ({ coupleId: membership.coupleId, code: TOKEN_A, expiresAt: timestamp(2) }));
}

describe("CoupleService", () => {
  it("creates a normalized couple without accepting a role from the caller", async () => {
    const repository = new MockCouples();
    const service = new CoupleService(repository, () => TOKEN_A, () => 10_000);
    const result = await service.createCouple("owner-a", "  Alex   & Sam  ");
    expect(result.membership.profile.name).toBe("Alex & Sam");
    expect(repository.create).toHaveBeenCalledWith("owner-a", {
      name: "Alex & Sam",
      inviteCode: TOKEN_A,
      expiresAt: 10_000 + INVITE_LIFETIME_MS,
    });
    expect(Object.keys(repository.create.mock.calls[0]?.[1] ?? {})).not.toContain("role");
  });

  it("deduplicates repeated create submissions while the first is pending", async () => {
    const repository = new MockCouples();
    let release: (() => void) | undefined;
    repository.create.mockImplementationOnce(async (_uid, input) => {
      await new Promise<void>((resolve) => { release = resolve; });
      return {
        membership,
        invite: { coupleId: membership.coupleId, code: input.inviteCode, expiresAt: timestamp(input.expiresAt) },
      };
    });
    const service = new CoupleService(repository, () => TOKEN_A, () => 10_000);
    const first = service.createCouple("owner-a", "Our space");
    const second = service.createCouple("owner-a", "Our space");
    expect(first).toBe(second);
    expect(repository.create).toHaveBeenCalledOnce();
    release?.();
    await first;
  });

  it("rejects invalid names and invite tokens before repository access", async () => {
    const repository = new MockCouples();
    const service = new CoupleService(repository, () => "short", () => 1);
    expect(() => service.createCouple("owner-a", "x")).toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
    expect(() => service.createCouple("owner-a", "Valid name")).toThrow(expect.objectContaining({ code: "UNKNOWN" }));
    expect(() => service.joinCouple("joiner", "owner-a", "short")).toThrow(expect.objectContaining({ code: "INVITE_NOT_FOUND" }));
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.redeem).not.toHaveBeenCalled();
  });

  it("passes a valid join to the repository without any role input", async () => {
    const repository = new MockCouples();
    const service = new CoupleService(repository, () => TOKEN_A, () => 1);
    await service.joinCouple("joiner", " owner-a ", ` ${TOKEN_A} `);
    expect(repository.redeem).toHaveBeenCalledWith("joiner", "owner-a", TOKEN_A);
  });

  it("generates a different owner-controlled token when regenerating", async () => {
    const repository = new MockCouples();
    const service = new CoupleService(repository, () => TOKEN_B, () => 20_000);
    const invite = await service.regenerateInvite("owner-a", "owner-a");
    expect(invite.code).toBe(TOKEN_B);
    expect(repository.regenerateInvite).toHaveBeenCalledWith("owner-a", "owner-a", TOKEN_B, 20_000 + INVITE_LIFETIME_MS);
  });
});
