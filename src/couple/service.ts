import { INVITE_LIFETIME_MS, type CoupleApplicationService, type CoupleRepository } from "./contracts";
import { CoupleError } from "./errors";
import { createInviteToken, isInviteToken } from "./inviteToken";
import type { CoupleMembership, InviteDetails } from "./types";
import { timestamp } from "../utils/date";

export { INVITE_LIFETIME_MS } from "./contracts";

export class CoupleService implements CoupleApplicationService {
  private readonly pendingCreates = new Map<string, Promise<{ membership: CoupleMembership; invite: InviteDetails }>>();

  constructor(
    private readonly repository: CoupleRepository,
    private readonly tokenFactory: () => string = createInviteToken,
    private readonly now: () => number = Date.now,
  ) {}

  findMembership(uid: string): Promise<CoupleMembership | null> {
    return this.repository.findMembership(requireUid(uid));
  }

  createCouple(uid: string, value: string): Promise<{ membership: CoupleMembership; invite: InviteDetails }> {
    const validUid = requireUid(uid);
    const existing = this.pendingCreates.get(validUid);
    if (existing) return existing;

    const name = validateCoupleName(value);
    const inviteCode = this.createToken();
    const expiresAt = this.now() + INVITE_LIFETIME_MS;
    const operation = this.repository.create(validUid, {
      name,
      inviteCode,
      expiresAt,
    }).then(({ membership, invite }) => ({
      membership,
      invite: { ...invite, expiresAt: timestamp(invite.expiresAt) },
    })).finally(() => this.pendingCreates.delete(validUid));

    this.pendingCreates.set(validUid, operation);
    return operation;
  }

  joinCouple(uid: string, coupleIdValue: string, inviteCodeValue: string): Promise<CoupleMembership> {
    const coupleId = coupleIdValue.trim();
    const inviteCode = inviteCodeValue.trim();
    if (!coupleId) {
      throw new CoupleError("VALIDATION_FAILED", "Enter the couple ID from the invitation.", { coupleId: "Couple ID is required." });
    }
    if (!isInviteToken(inviteCode)) {
      throw new CoupleError("INVITE_NOT_FOUND", "This invitation link is not valid.", { inviteCode: "Enter the complete invitation code." });
    }
    return this.repository.redeem(requireUid(uid), coupleId, inviteCode);
  }

  regenerateInvite(uid: string, coupleId: string): Promise<InviteDetails> {
    return this.repository.regenerateInvite(
      requireUid(uid),
      coupleId,
      this.createToken(),
      this.now() + INVITE_LIFETIME_MS,
    );
  }

  getOwnerInvite(uid: string, coupleId: string): Promise<InviteDetails> {
    return this.repository.getOwnerInvite(requireUid(uid), coupleId);
  }

  updateStartDate(uid: string, coupleId: string, startDate: string): Promise<void> {
    const normalized = startDate.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(normalized)) throw new CoupleError("VALIDATION_FAILED", "Ngày bắt đầu chưa hợp lệ.");
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
    if (normalized > today) throw new CoupleError("VALIDATION_FAILED", "Ngày bắt đầu không thể ở tương lai.");
    if (!this.repository.updateStartDate) throw new CoupleError("UNKNOWN", "Tính năng này chưa sẵn sàng.");
    return this.repository.updateStartDate(requireUid(uid), coupleId, normalized);
  }

  private createToken(): string {
    const token = this.tokenFactory();
    if (!isInviteToken(token)) throw new CoupleError("UNKNOWN", "Không thể tạo lời mời an toàn. Vui lòng thử lại.");
    return token;
  }
}

function requireUid(uid: string): string {
  if (!uid.trim()) throw new CoupleError("UNAUTHORIZED", "Hãy đăng nhập để tiếp tục.");
  return uid;
}

function validateCoupleName(value: string): string {
  const name = value.trim().replace(/\s+/gu, " ");
  if (name.length < 2 || name.length > 60) {
    throw new CoupleError("VALIDATION_FAILED", "Choose a name between 2 and 60 characters.", {
      name: "Use between 2 and 60 characters.",
    });
  }
  return name;
}
