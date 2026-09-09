import type { AuthUser, LoginInput, RegisterInput } from "./types";

export type AuthStateObserver = (user: AuthUser | null) => void;
export type AuthErrorObserver = (error: unknown) => void;
export type Unsubscribe = () => void;

export interface AuthProvider {
  register(email: string, password: string): Promise<AuthUser>;
  login(email: string, password: string): Promise<AuthUser>;
  logout(): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  deleteCurrentUser(): Promise<void>;
  observeAuthState(observer: AuthStateObserver, onError: AuthErrorObserver): Unsubscribe;
}

export interface UserProfileRepository {
  create(uid: string, profile: { displayName: string; email: string }): Promise<void>;
}

export interface AuthenticationService {
  register(input: RegisterInput): Promise<AuthUser>;
  login(input: LoginInput): Promise<AuthUser>;
  logout(): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  observeAuthState(observer: AuthStateObserver, onError?: AuthErrorObserver): Unsubscribe;
}
