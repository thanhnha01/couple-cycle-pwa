import { describe, expect, it, vi } from "vitest";
import type { AuthenticationService, AuthErrorObserver, AuthStateObserver } from "./contracts";
import { AuthSessionStore, type AuthSessionState } from "./session";
import type { AuthUser, LoginInput, RegisterInput } from "./types";

const user: AuthUser = { uid: "user-a", email: "person@example.com", displayName: "Alex" };

class SessionAuth implements AuthenticationService {
  observer: AuthStateObserver | undefined;
  register(_input: RegisterInput): Promise<AuthUser> { return Promise.resolve(user); }
  login(_input: LoginInput): Promise<AuthUser> { return Promise.resolve(user); }
  logout(): Promise<void> { return Promise.resolve(); }
  requestPasswordReset(_email: string): Promise<void> { return Promise.resolve(); }
  observeAuthState(observer: AuthStateObserver, _onError?: AuthErrorObserver): () => void {
    this.observer = observer;
    return vi.fn();
  }
}

describe("AuthSessionStore", () => {
  it("remains initializing until the first auth observation", () => {
    const auth = new SessionAuth();
    const store = new AuthSessionStore(auth);
    store.start();
    expect(store.snapshot).toEqual({ status: "initializing" });
  });

  it("moves to authenticated when Firebase restores a user", () => {
    const auth = new SessionAuth();
    const store = new AuthSessionStore(auth);
    const states: AuthSessionState[] = [];
    store.subscribe((state) => states.push(state));
    store.start();
    auth.observer?.(user);
    expect(store.snapshot).toEqual({ status: "authenticated", user });
    expect(states.map((state) => state.status)).toEqual(["initializing", "authenticated"]);
  });

  it("moves to unauthenticated after the initial null observation", () => {
    const auth = new SessionAuth();
    const store = new AuthSessionStore(auth);
    store.start();
    auth.observer?.(null);
    expect(store.snapshot).toEqual({ status: "unauthenticated" });
  });
});
