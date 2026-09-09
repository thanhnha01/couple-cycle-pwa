import type { Timestamp } from "../utils/date";

export type CoupleRole = "owner" | "member";

export interface CoupleProfile {
  name: string;
  createdAt: Timestamp;
  ownerUid: string;
  memberCount: 1 | 2;
}

export interface CoupleMember {
  role: CoupleRole;
  joinedAt: Timestamp;
}

export interface CoupleInvite {
  code: string;
  active: boolean;
  createdAt: Timestamp;
  expiresAt: Timestamp;
  redeemedBy?: string;
  redeemedAt?: Timestamp;
  /** Persisted only after redemption so Rules can verify knowledge of the capability token. */
  redemptionProof?: string;
}

export interface CoupleRecord {
  profile: CoupleProfile;
  members: Record<string, CoupleMember>;
  invite: CoupleInvite;
}

export interface CoupleMembership {
  coupleId: string;
  profile: CoupleProfile;
  member: CoupleMember;
}

export interface InviteDetails {
  coupleId: string;
  code: string;
  expiresAt: Timestamp;
}

export interface InviteLookup {
  coupleId: string;
  active: boolean;
  createdAt: Timestamp;
  expiresAt: Timestamp;
  redeemedBy?: string;
  redeemedAt?: Timestamp;
  invalidatedBy?: string;
  invalidatedAt?: Timestamp;
}

// These types reserve the Milestone 3 namespaces without implementing behavior.
export type CouplePeriods = Record<string, never>;
export type CouplePresence = Record<string, never>;

// Compatibility aliases for the IndexedDB-ready storage layer.
export interface Couple extends CoupleProfile {
  id: string;
}

export interface Member extends CoupleMember {
  id: string;
  coupleId: string;
  userId: string;
}

export interface Invite extends CoupleInvite {
  id: string;
  coupleId: string;
}

export interface Presence {
  id: string;
  coupleId: string;
  userId: string;
  state: "online" | "away" | "offline";
  lastSeenAt: Timestamp;
  updatedAt: Timestamp;
}
