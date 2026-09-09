import type { Timestamp } from "../utils/date";

export interface SyncOperation {
  id: string;
  coupleId: string;
  uid: string;
  entityType: string;
  entityId: string;
  action: "create" | "update" | "delete";
  payload: unknown;
  /** Revision observed locally before the mutation, used to prevent stale writes. */
  expectedRevision?: number;
  status: "pending" | "processing" | "completed" | "failed" | "conflict";
  attempts: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  nextRetryAt?: Timestamp;
  error?: string;
}

export type SyncState = "synced" | "syncing" | "offline" | "pending" | "error";
