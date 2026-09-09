import type { Timestamp } from "../utils/date";

export interface User {
  id: string;
  email: string;
  displayName?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
