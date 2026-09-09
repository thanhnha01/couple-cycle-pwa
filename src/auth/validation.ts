import { AuthError } from "./errors";
import type { LoginInput, RegisterInput } from "./types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(email: string, errors: Record<string, string>): string {
  const normalized = email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(normalized)) errors.email = "Enter a valid email address.";
  return normalized;
}

function throwIfInvalid(errors: Record<string, string>): void {
  if (Object.keys(errors).length > 0) {
    throw new AuthError("VALIDATION_FAILED", "Please check the highlighted fields.", errors);
  }
}

export function validateRegistration(input: RegisterInput): RegisterInput {
  const errors: Record<string, string> = {};
  const displayName = input.displayName.trim();
  const email = validateEmail(input.email, errors);

  if (displayName.length < 2 || displayName.length > 80) errors.displayName = "Enter a name between 2 and 80 characters.";
  if (input.password.length < 8) errors.password = "Use at least 8 characters.";
  if (input.password !== input.passwordConfirmation) errors.passwordConfirmation = "Passwords do not match.";
  throwIfInvalid(errors);

  return { ...input, displayName, email };
}

export function validateLogin(input: LoginInput): LoginInput {
  const errors: Record<string, string> = {};
  const email = validateEmail(input.email, errors);
  if (input.password.length === 0) errors.password = "Enter your password.";
  throwIfInvalid(errors);
  return { email, password: input.password };
}

export function validateResetEmail(value: string): string {
  const errors: Record<string, string> = {};
  const email = validateEmail(value, errors);
  throwIfInvalid(errors);
  return email;
}
