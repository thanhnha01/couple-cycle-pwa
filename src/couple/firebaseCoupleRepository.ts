import { get, ref, remove, serverTimestamp, set, update, type DataSnapshot } from "firebase/database";
import { getFirebaseDatabase } from "../firebase/database";
import { timestamp } from "../utils/date";
import { INVITE_LIFETIME_MS, type CoupleRepository, type CreateCoupleRecord } from "./contracts";
import { CoupleError, firebaseDatabaseErrorCode } from "./errors";
import type { CoupleInvite, CoupleMember, CoupleMembership, CoupleProfile, InviteDetails, InviteLookup } from "./types";

interface RedemptionClaim {
  coupleId: string;
  code: string;
  createdAt: ReturnType<typeof serverTimestamp>;
}

export class FirebaseCoupleRepository implements CoupleRepository {
  async findMembership(uid: string): Promise<CoupleMembership | null> {
    const database = getFirebaseDatabase();
    try {
      const association = await get(ref(database, `users/${uid}/coupleId`));
      if (association.exists()) {
        const coupleId = association.val();
        if (typeof coupleId !== "string") throw unauthorizedAssociation();
        return await this.readMembership(coupleId, uid);
      }

      // Creators have a deterministic couple id, which makes the only partial
      // create failure (a missing derived association) safely recoverable.
      const recoverableMember = await get(ref(database, `couples/${uid}/members/${uid}`));
      if (!recoverableMember.exists()) return null;
      const membership = await this.readMembership(uid, uid);
      await this.ensureAssociation(uid, uid);
      return membership;
    } catch (error) {
      if (error instanceof CoupleError) throw error;
      throw mapDatabaseFailure(error);
    }
  }

  async create(uid: string, input: CreateCoupleRecord): Promise<{ membership: CoupleMembership; invite: InviteDetails }> {
    const existing = await this.findMembership(uid);
    if (existing) throw new CoupleError("ALREADY_MEMBER", "You already belong to a couple.");

    const database = getFirebaseDatabase();
    const coupleId = uid;
    const createdAt = serverTimestamp();
    const expiresAt = await serverAlignedExpiration(input.expiresAt);
    try {
      await update(ref(database), {
        [`couples/${coupleId}`]: {
          profile: { name: input.name, createdAt, ownerUid: uid, memberCount: 1 },
          members: { [uid]: { role: "owner", joinedAt: createdAt } },
          invite: {
            code: input.inviteCode,
            active: true,
            createdAt,
            expiresAt,
          },
        },
        [`inviteLookups/${input.inviteCode}`]: {
          coupleId,
          active: true,
          createdAt,
          expiresAt,
        },
      });
    } catch (error) {
      // A concurrent duplicate submit can lose the create race. Recover the
      // authoritative record instead of creating a second couple.
      const recovered = await this.tryReadMembership(coupleId, uid);
      if (recovered) {
        await this.ensureAssociation(uid, coupleId);
        return { membership: recovered, invite: await this.getOwnerInvite(uid, coupleId) };
      }
      throw mapDatabaseFailure(error);
    }

    await this.ensureAssociation(uid, coupleId);
    const membership = await this.readMembership(coupleId, uid);
    return {
      membership,
      invite: { coupleId, code: input.inviteCode, expiresAt: timestamp(expiresAt) },
    };
  }

  async redeem(uid: string, requestedCoupleId: string, inviteCode: string): Promise<CoupleMembership> {
    const existing = await this.findMembership(uid);
    if (existing) throw new CoupleError("ALREADY_MEMBER", "You already belong to a couple.");

    const database = getFirebaseDatabase();
    const lookupReference = ref(database, `inviteLookups/${inviteCode}`);
    const lookup = parseInviteLookup(await get(lookupReference));
    validateRedeemableLookup(lookup, requestedCoupleId, uid, await currentServerTime());
    if (!lookup.active && lookup.redeemedBy === uid) {
      await this.ensureAssociation(uid, requestedCoupleId);
      await this.clearClaim(uid);
      return this.readMembership(requestedCoupleId, uid);
    }

    const claim: RedemptionClaim = { coupleId: requestedCoupleId, code: inviteCode, createdAt: serverTimestamp() };
    await set(ref(database, `inviteClaims/${uid}`), claim).catch((error: unknown) => {
      throw mapDatabaseFailure(error);
    });

    try {
      await update(ref(database), {
        [`couples/${requestedCoupleId}/profile/memberCount`]: 2,
        [`couples/${requestedCoupleId}/members/${uid}`]: { role: "member", joinedAt: serverTimestamp() },
        [`couples/${requestedCoupleId}/invite/active`]: false,
        [`couples/${requestedCoupleId}/invite/redeemedBy`]: uid,
        [`couples/${requestedCoupleId}/invite/redeemedAt`]: serverTimestamp(),
        [`couples/${requestedCoupleId}/invite/redemptionProof`]: inviteCode,
      });
    } catch (error) {
      const recovered = await this.tryReadMembership(requestedCoupleId, uid);
      if (recovered) {
        await this.ensureAssociation(uid, requestedCoupleId);
        await this.finalizeRedeemedLookup(uid, requestedCoupleId, inviteCode);
        await this.clearClaim(uid);
        return recovered;
      }
      const currentLookup = await get(lookupReference).then(parseInviteLookup).catch(() => null);
      if (currentLookup?.redeemedBy === uid) {
        await this.ensureAssociation(uid, requestedCoupleId);
        await this.clearClaim(uid);
        return this.readMembership(requestedCoupleId, uid);
      }
      await this.clearClaim(uid);
      if (currentLookup && !currentLookup.active) {
        throw new CoupleError("CONCURRENT_REDEMPTION", "This invitation was accepted by someone else at the same time.");
      }
      if (currentLookup && currentLookup.expiresAt <= await currentServerTime()) {
        throw new CoupleError("INVITE_EXPIRED", "This invitation has expired. Ask the owner for a new one.");
      }
      const code = firebaseDatabaseErrorCode(error);
      if (code === "PERMISSION_DENIED" || code === "database/permission-denied") {
        throw new CoupleError("CONCURRENT_REDEMPTION", "This invitation is no longer redeemable.");
      }
      throw mapDatabaseFailure(error);
    }

    try {
      await this.ensureAssociation(uid, requestedCoupleId);
      await this.finalizeRedeemedLookup(uid, requestedCoupleId, inviteCode);
      return await this.readMembership(requestedCoupleId, uid);
    } finally {
      await this.clearClaim(uid);
    }
  }

  async regenerateInvite(uid: string, coupleId: string, inviteCode: string, expiresAt: number): Promise<InviteDetails> {
    const current = await this.getOwnerInvite(uid, coupleId);
    const database = getFirebaseDatabase();
    const serverExpiresAt = await serverAlignedExpiration(expiresAt);
    try {
      await update(ref(database), {
        [`couples/${coupleId}/invite`]: {
          code: inviteCode,
          active: true,
          createdAt: serverTimestamp(),
          expiresAt: serverExpiresAt,
        },
        [`inviteLookups/${current.code}/active`]: false,
        [`inviteLookups/${current.code}/invalidatedBy`]: uid,
        [`inviteLookups/${current.code}/invalidatedAt`]: serverTimestamp(),
        [`inviteLookups/${inviteCode}`]: {
          coupleId,
          active: true,
          createdAt: serverTimestamp(),
          expiresAt: serverExpiresAt,
        },
      });
      return { coupleId, code: inviteCode, expiresAt: timestamp(serverExpiresAt) };
    } catch (error) {
      throw mapDatabaseFailure(error);
    }
  }

  async getOwnerInvite(uid: string, coupleId: string): Promise<InviteDetails> {
    const membership = await this.readMembership(coupleId, uid);
    if (membership.member.role !== "owner") {
      throw new CoupleError("UNAUTHORIZED", "Chỉ người tạo không gian mới có thể quản lý lời mời.");
    }
    const snapshot = await get(ref(getFirebaseDatabase(), `couples/${coupleId}/invite`)).catch((error: unknown) => {
      throw mapDatabaseFailure(error);
    });
    const invite = parseInvite(snapshot);
    if (!invite.active) throw new CoupleError("INVITE_ALREADY_REDEEMED", "This invitation has already been used.");
    return { coupleId, code: invite.code, expiresAt: invite.expiresAt };
  }

  async updateStartDate(uid: string, coupleId: string, startDate: string): Promise<void> {
    await this.readMembership(coupleId, uid);
    try {
      await set(ref(getFirebaseDatabase(), `couples/${coupleId}/profile/startDate`), startDate);
    } catch (error) {
      throw mapDatabaseFailure(error);
    }
  }

  private async ensureAssociation(uid: string, coupleId: string): Promise<void> {
    await set(ref(getFirebaseDatabase(), `users/${uid}/coupleId`), coupleId).catch((error: unknown) => {
      throw mapDatabaseFailure(error);
    });
  }

  private async clearClaim(uid: string): Promise<void> {
    await remove(ref(getFirebaseDatabase(), `inviteClaims/${uid}`)).catch(() => undefined);
  }

  private async finalizeRedeemedLookup(uid: string, coupleId: string, inviteCode: string): Promise<void> {
    try {
      const invite = parseInvite(await get(ref(getFirebaseDatabase(), `couples/${coupleId}/invite`)));
      if (invite.active || invite.redeemedBy !== uid || invite.redeemedAt === undefined) return;
      await update(ref(getFirebaseDatabase(), `inviteLookups/${inviteCode}`), {
        active: false,
        redeemedBy: uid,
        redeemedAt: invite.redeemedAt,
      });
    } catch {
      // The canonical couple invite is already consumed. This derived private
      // lookup is repaired by an idempotent retry if transport failed here.
    }
  }

  private async tryReadMembership(coupleId: string, uid: string): Promise<CoupleMembership | null> {
    try {
      return await this.readMembership(coupleId, uid);
    } catch {
      return null;
    }
  }

  private async readMembership(coupleId: string, uid: string): Promise<CoupleMembership> {
    const database = getFirebaseDatabase();
    try {
      const [profileSnapshot, memberSnapshot] = await Promise.all([
        get(ref(database, `couples/${coupleId}/profile`)),
        get(ref(database, `couples/${coupleId}/members/${uid}`)),
      ]);
      if (!profileSnapshot.exists() || !memberSnapshot.exists()) throw unauthorizedAssociation();
      return {
        coupleId,
        profile: parseProfile(profileSnapshot),
        member: parseMember(memberSnapshot),
      };
    } catch (error) {
      if (error instanceof CoupleError) throw error;
      throw mapDatabaseFailure(error);
    }
  }
}

function parseProfile(snapshot: DataSnapshot): CoupleProfile {
  const value = snapshot.val() as Partial<CoupleProfile> | null;
  if (!value || typeof value.name !== "string" || typeof value.createdAt !== "number" || typeof value.ownerUid !== "string" || (value.memberCount !== 1 && value.memberCount !== 2)) {
    throw unauthorizedAssociation();
  }
  return { name: value.name, createdAt: timestamp(value.createdAt), ownerUid: value.ownerUid, memberCount: value.memberCount, ...(typeof value.startDate === "string" ? { startDate: value.startDate } : {}) };
}

function parseMember(snapshot: DataSnapshot): CoupleMember {
  const value = snapshot.val() as Partial<CoupleMember> | null;
  if (!value || (value.role !== "owner" && value.role !== "member") || typeof value.joinedAt !== "number") {
    throw unauthorizedAssociation();
  }
  return { role: value.role, joinedAt: timestamp(value.joinedAt) };
}

function parseInvite(snapshot: DataSnapshot): CoupleInvite {
  const value = snapshot.val() as Partial<CoupleInvite> | null;
  if (!value || typeof value.code !== "string" || typeof value.active !== "boolean" || typeof value.createdAt !== "number" || typeof value.expiresAt !== "number") {
    throw new CoupleError("INVITE_NOT_FOUND", "This invitation is no longer available.");
  }
  return {
    code: value.code,
    active: value.active,
    createdAt: timestamp(value.createdAt),
    expiresAt: timestamp(value.expiresAt),
    ...(typeof value.redeemedBy === "string" ? { redeemedBy: value.redeemedBy } : {}),
    ...(typeof value.redeemedAt === "number" ? { redeemedAt: timestamp(value.redeemedAt) } : {}),
  };
}

function parseInviteLookup(snapshot: DataSnapshot): InviteLookup | null {
  if (!snapshot.exists()) return null;
  const value = snapshot.val() as Partial<InviteLookup> | null;
  if (!value || typeof value.coupleId !== "string" || typeof value.active !== "boolean" || typeof value.createdAt !== "number" || typeof value.expiresAt !== "number") return null;
  return {
    coupleId: value.coupleId,
    active: value.active,
    createdAt: timestamp(value.createdAt),
    expiresAt: timestamp(value.expiresAt),
    ...(typeof value.redeemedBy === "string" ? { redeemedBy: value.redeemedBy } : {}),
    ...(typeof value.redeemedAt === "number" ? { redeemedAt: timestamp(value.redeemedAt) } : {}),
  };
}

function validateRedeemableLookup(lookup: InviteLookup | null, requestedCoupleId: string, uid: string, serverNow: number): asserts lookup is InviteLookup {
  if (!lookup) throw new CoupleError("INVITE_NOT_FOUND", "This invitation link is not valid.");
  if (lookup.coupleId !== requestedCoupleId) throw new CoupleError("WRONG_INVITE", "This invitation does not belong to that couple.");
  if (!lookup.active) {
    if (lookup.redeemedBy === uid) return;
    throw new CoupleError("INVITE_ALREADY_REDEEMED", "This invitation has already been used.");
  }
  if (lookup.expiresAt <= serverNow) throw new CoupleError("INVITE_EXPIRED", "This invitation has expired. Ask the owner for a new one.");
}

function unauthorizedAssociation(): CoupleError {
  return new CoupleError("UNAUTHORIZED", "Không thể xác thực không gian chung của bạn.");
}

function mapDatabaseFailure(error: unknown): CoupleError {
  if (error instanceof CoupleError) return error;
  const code = firebaseDatabaseErrorCode(error);
  if (code === "PERMISSION_DENIED" || code === "database/permission-denied") {
    return new CoupleError("UNAUTHORIZED", "Bạn không có quyền thực hiện thao tác này.");
  }
  if (code === "NETWORK_ERROR" || code === "database/network-error") {
    return new CoupleError("NETWORK_ERROR", "Check your connection and try again.");
  }
  return new CoupleError("UNKNOWN", "Không thể cập nhật không gian chung. Vui lòng thử lại.");
}

async function serverAlignedExpiration(requestedExpiration: number): Promise<number> {
  const requestedLifetime = Math.min(INVITE_LIFETIME_MS, Math.max(1_000, requestedExpiration - Date.now()));
  return await currentServerTime() + requestedLifetime;
}

async function currentServerTime(): Promise<number> {
  try {
    const snapshot = await get(ref(getFirebaseDatabase(), ".info/serverTimeOffset"));
    const offset = snapshot.val();
    return Date.now() + (typeof offset === "number" ? offset : 0);
  } catch {
    return Date.now();
  }
}
