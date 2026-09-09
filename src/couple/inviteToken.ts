const TOKEN_BYTES = 32;

export function createInviteToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

export function isInviteToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/u.test(value);
}
