import type { CoupleMembership, InviteDetails } from "./types";

export const INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1_000;

export interface CreateCoupleRecord {
  name: string;
  inviteCode: string;
  expiresAt: number;
}

export interface CoupleRepository {
  findMembership(uid: string): Promise<CoupleMembership | null>;
  create(uid: string, input: CreateCoupleRecord): Promise<{ membership: CoupleMembership; invite: InviteDetails }>;
  redeem(uid: string, coupleId: string, inviteCode: string): Promise<CoupleMembership>;
  regenerateInvite(uid: string, coupleId: string, inviteCode: string, expiresAt: number): Promise<InviteDetails>;
  getOwnerInvite(uid: string, coupleId: string): Promise<InviteDetails>;
}

export interface CoupleApplicationService {
  findMembership(uid: string): Promise<CoupleMembership | null>;
  createCouple(uid: string, name: string): Promise<{ membership: CoupleMembership; invite: InviteDetails }>;
  joinCouple(uid: string, coupleId: string, inviteCode: string): Promise<CoupleMembership>;
  regenerateInvite(uid: string, coupleId: string): Promise<InviteDetails>;
  getOwnerInvite(uid: string, coupleId: string): Promise<InviteDetails>;
}
