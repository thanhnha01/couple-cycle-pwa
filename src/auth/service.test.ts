import { describe, expect, it, vi } from "vitest";
import type { AuthErrorObserver, AuthProvider, AuthStateObserver, UserProfileRepository } from "./contracts";
import { AuthService } from "./service";
import type { AuthUser } from "./types";

const user: AuthUser = { uid: "user-a", email: "person@example.com", displayName: null };

class MockProvider implements AuthProvider {
  observer: AuthStateObserver | undefined;
  errorObserver: AuthErrorObserver | undefined;
  register = vi.fn(async (): Promise<AuthUser> => user);
  login = vi.fn(async (): Promise<AuthUser> => user);
  logout = vi.fn(async (): Promise<void> => undefined);
  requestPasswordReset = vi.fn(async (): Promise<void> => undefined);
  deleteCurrentUser = vi.fn(async (): Promise<void> => undefined);
  observeAuthState = vi.fn((observer: AuthStateObserver, onError: AuthErrorObserver) => {
    this.observer = observer;
    this.errorObserver = onError;
    return () => undefined;
  });
}

class MockProfiles implements UserProfileRepository {
  create = vi.fn(async (): Promise<void> => undefined);
}

const registration = {
  displayName: "  Alex  ",
  email: " PERSON@EXAMPLE.COM ",
  password: "strong-pass",
  passwordConfirmation: "strong-pass",
};

describe("AuthService registration", () => {
  it("registers valid details and creates the authenticated user's minimal profile", async () => {
    const provider = new MockProvider();
    const profiles = new MockProfiles();
    const service = new AuthService(provider, profiles);

    await expect(service.register(registration)).resolves.toEqual({ ...user, displayName: "Alex" });
    expect(provider.register).toHaveBeenCalledWith("person@example.com", "strong-pass");
    expect(profiles.create).toHaveBeenCalledWith("user-a", { displayName: "Alex", email: "person@example.com" });
  });

  it("rejects an invalid email before Firebase is called", async () => {
    const provider = new MockProvider();
    const service = new AuthService(provider, new MockProfiles());
    await expect(service.register({ ...registration, email: "not-an-email" })).rejects.toMatchObject({
      code: "VALIDATION_FAILED", fieldErrors: { email: expect.any(String) },
    });
    expect(provider.register).not.toHaveBeenCalled();
  });

  it("rejects a short password before Firebase is called", async () => {
    const provider = new MockProvider();
    const service = new AuthService(provider, new MockProfiles());
    await expect(service.register({ ...registration, password: "short", passwordConfirmation: "short" })).rejects.toMatchObject({
      code: "VALIDATION_FAILED", fieldErrors: { password: expect.any(String) },
    });
    expect(provider.register).not.toHaveBeenCalled();
  });

  it("rejects a password confirmation mismatch", async () => {
    const service = new AuthService(new MockProvider(), new MockProfiles());
    await expect(service.register({ ...registration, passwordConfirmation: "different" })).rejects.toMatchObject({
      code: "VALIDATION_FAILED", fieldErrors: { passwordConfirmation: expect.any(String) },
    });
  });

  it("maps Firebase registration failures without leaking raw exception messages", async () => {
    const provider = new MockProvider();
    provider.register.mockRejectedValueOnce({ code: "auth/email-already-in-use", message: "raw firebase detail" });
    const service = new AuthService(provider, new MockProfiles());
    const error = await service.register(registration).catch((reason: unknown) => reason);
    expect(error).toMatchObject({ code: "ACCOUNT_CREATION_FAILED" });
    expect((error as Error).message).not.toContain("raw firebase detail");
  });

  it("rolls back and reports failure when profile creation fails", async () => {
    const provider = new MockProvider();
    const profiles = new MockProfiles();
    profiles.create.mockRejectedValueOnce(new Error("database unavailable"));
    const service = new AuthService(provider, profiles);

    await expect(service.register(registration)).rejects.toMatchObject({ code: "PROFILE_CREATION_FAILED" });
    expect(provider.deleteCurrentUser).toHaveBeenCalledOnce();
  });
});

describe("AuthService login and reset", () => {
  it("logs in with normalized credentials", async () => {
    const provider = new MockProvider();
    const service = new AuthService(provider, new MockProfiles());
    await expect(service.login({ email: " PERSON@EXAMPLE.COM ", password: "secret" })).resolves.toEqual(user);
    expect(provider.login).toHaveBeenCalledWith("person@example.com", "secret");
  });

  it("maps invalid credentials to a neutral controlled error", async () => {
    const provider = new MockProvider();
    provider.login.mockRejectedValueOnce({ code: "auth/invalid-credential", message: "raw firebase detail" });
    const service = new AuthService(provider, new MockProfiles());
    await expect(service.login({ email: "person@example.com", password: "wrong" })).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
      message: "The email or password is incorrect.",
    });
  });

  it("requests a password reset for a valid normalized email", async () => {
    const provider = new MockProvider();
    const service = new AuthService(provider, new MockProfiles());
    await service.requestPasswordReset(" PERSON@EXAMPLE.COM ");
    expect(provider.requestPasswordReset).toHaveBeenCalledWith("person@example.com");
  });

  it("maps password reset transport failures", async () => {
    const provider = new MockProvider();
    provider.requestPasswordReset.mockRejectedValueOnce({ code: "auth/internal-error" });
    const service = new AuthService(provider, new MockProfiles());
    await expect(service.requestPasswordReset("person@example.com")).rejects.toMatchObject({ code: "RESET_REQUEST_FAILED" });
  });

  it("treats unknown reset accounts neutrally", async () => {
    const provider = new MockProvider();
    provider.requestPasswordReset.mockRejectedValueOnce({ code: "auth/user-not-found" });
    const service = new AuthService(provider, new MockProfiles());
    await expect(service.requestPasswordReset("person@example.com")).resolves.toBeUndefined();
  });
});
