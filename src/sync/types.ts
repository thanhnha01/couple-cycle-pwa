import type { Timestamp } from "../utils/date";

export interface SyncOperation {
  id: string;
  entityType: string;
  entityId: string;
  action: "create" | "update" | "delete";
  payload: unknown;
  status: "pending" | "processing" | "completed" | "failed";
  attempts: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
