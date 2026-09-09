export type CoupleErrorCode =
  | "VALIDATION_FAILED"
  | "INVITE_NOT_FOUND"
  | "INVITE_EXPIRED"
  | "INVITE_ALREADY_REDEEMED"
  | "WRONG_INVITE"
  | "COUPLE_FULL"
  | "ALREADY_MEMBER"
  | "UNAUTHORIZED"
  | "CONCURRENT_REDEMPTION"
  | "NETWORK_ERROR"
  | "UNKNOWN";

export class CoupleError extends Error {
  constructor(
    public readonly code: CoupleErrorCode,
    message: string,
    public readonly fieldErrors: Readonly<Record<string, string>> = {},
  ) {
    super(message);
    this.name = "CoupleError";
  }
}

export function firebaseDatabaseErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}
