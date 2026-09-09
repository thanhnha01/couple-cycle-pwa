import type { Timestamp } from "../utils/date";

export interface Couple {
  id: string;
  memberIds: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Member {
  id: string;
  coupleId: string;
  userId: string;
  role: "owner" | "partner";
  joinedAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Invite {
  id: string;
  coupleId: string;
  invitedEmail?: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  createdAt: Timestamp;
  expiresAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Presence {
  id: string;
  coupleId: string;
  userId: string;
  state: "online" | "away" | "offline";
  lastSeenAt: Timestamp;
  updatedAt: Timestamp;
}
