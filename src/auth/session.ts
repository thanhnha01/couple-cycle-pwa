import type { AuthenticationService, Unsubscribe } from "./contracts";
import type { AuthUser } from "./types";

export type AuthSessionState =
  | { status: "initializing" }
  | { status: "authenticated"; user: AuthUser }
  | { status: "unauthenticated" };

export class AuthSessionStore {
  private state: AuthSessionState = { status: "initializing" };
  private readonly listeners = new Set<(state: AuthSessionState) => void>();
  private stopObserver: Unsubscribe | undefined;

  constructor(private readonly auth: AuthenticationService) {}

  get snapshot(): AuthSessionState {
    return this.state;
  }

  start(): void {
    if (this.stopObserver) return;
    this.stopObserver = this.auth.observeAuthState(
      (user) => this.update(user ? { status: "authenticated", user } : { status: "unauthenticated" }),
      () => this.update({ status: "unauthenticated" }),
    );
  }

  subscribe(listener: (state: AuthSessionState) => void): Unsubscribe {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  stop(): void {
    this.stopObserver?.();
    this.stopObserver = undefined;
    this.listeners.clear();
    this.state = { status: "initializing" };
  }

  private update(state: AuthSessionState): void {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
}
