export type AuthErrorCode =
  | "VALIDATION_FAILED"
  | "INVALID_CREDENTIALS"
  | "ACCOUNT_CREATION_FAILED"
  | "WEAK_PASSWORD"
  | "TOO_MANY_REQUESTS"
  | "NETWORK_ERROR"
  | "PROFILE_CREATION_FAILED"
  | "RESET_REQUEST_FAILED"
  | "CONFIGURATION_ERROR"
  | "UNKNOWN";

export class AuthError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    message: string,
    public readonly fieldErrors: Readonly<Record<string, string>> = {},
  ) {
    super(message);
    this.name = "AuthError";
  }
}

function firebaseCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

export function hasFirebaseErrorCode(error: unknown, code: string): boolean {
  return firebaseCode(error) === code;
}

export function mapFirebaseAuthError(error: unknown, operation: "register" | "login" | "logout" | "reset"): AuthError {
  if (error instanceof AuthError) return error;

  const code = firebaseCode(error);
  if (code === "auth/network-request-failed") {
    return new AuthError("NETWORK_ERROR", "Check your connection and try again.");
  }
  if (code === "auth/too-many-requests") {
    return new AuthError("TOO_MANY_REQUESTS", "Too many attempts. Please wait a little before trying again.");
  }
  if (code === "auth/weak-password") {
    return new AuthError("WEAK_PASSWORD", "Choose a stronger password with at least 8 characters.", {
      password: "Choose a stronger password with at least 8 characters.",
    });
  }
  if (operation === "login" && ["auth/invalid-credential", "auth/user-not-found", "auth/wrong-password"].includes(code ?? "")) {
    return new AuthError("INVALID_CREDENTIALS", "The email or password is incorrect.");
  }
  if (operation === "register" && ["auth/email-already-in-use", "auth/invalid-email", "auth/operation-not-allowed"].includes(code ?? "")) {
    return new AuthError("ACCOUNT_CREATION_FAILED", "We could not create an account with those details.");
  }
  if (operation === "reset") {
    return new AuthError("RESET_REQUEST_FAILED", "We could not send the reset email right now. Please try again.");
  }

  return new AuthError("UNKNOWN", operation === "logout" ? "We could not sign you out. Please try again." : "Something went wrong. Please try again.");
}
