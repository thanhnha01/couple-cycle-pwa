import type { Timestamp } from "../utils/date";

export interface User {
  id: string;
  email: string;
  displayName: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AuthUser {
  uid: string;
  email: string;
  displayName: string | null;
}

export interface RegisterInput {
  displayName: string;
  email: string;
  password: string;
  passwordConfirmation: string;
}

export interface LoginInput {
  email: string;
  password: string;
}
