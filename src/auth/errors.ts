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
    return new AuthError("NETWORK_ERROR", "Kiểm tra kết nối rồi thử lại nhé.");
  }
  if (code === "auth/too-many-requests") {
    return new AuthError("TOO_MANY_REQUESTS", "Bạn đã thử quá nhiều lần. Hãy đợi một chút rồi thử lại.");
  }
  if (code === "auth/weak-password") {
    return new AuthError("WEAK_PASSWORD", "Hãy chọn mật khẩu mạnh hơn, có ít nhất 8 ký tự.", {
      password: "Hãy chọn mật khẩu mạnh hơn, có ít nhất 8 ký tự.",
    });
  }
  if (operation === "login" && ["auth/invalid-credential", "auth/user-not-found", "auth/wrong-password"].includes(code ?? "")) {
    return new AuthError("INVALID_CREDENTIALS", "Email hoặc mật khẩu chưa đúng.");
  }
  if (operation === "register" && ["auth/email-already-in-use", "auth/invalid-email", "auth/operation-not-allowed"].includes(code ?? "")) {
    return new AuthError("ACCOUNT_CREATION_FAILED", "Không thể tạo tài khoản với thông tin này.");
  }
  if (operation === "reset") {
    return new AuthError("RESET_REQUEST_FAILED", "Chưa thể gửi email đặt lại mật khẩu. Vui lòng thử lại.");
  }

  return new AuthError("UNKNOWN", operation === "logout" ? "Không thể đăng xuất lúc này. Vui lòng thử lại." : "Đã có lỗi xảy ra. Vui lòng thử lại.");
}
