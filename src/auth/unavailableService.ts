import type { AuthenticationService, AuthErrorObserver, AuthStateObserver, Unsubscribe } from "./contracts";
import { AuthError } from "./errors";
import type { AuthUser, LoginInput, RegisterInput } from "./types";
import { validateLogin, validateRegistration, validateResetEmail } from "./validation";

const configurationError = (): AuthError =>
  new AuthError("CONFIGURATION_ERROR", "Ứng dụng chưa được cấu hình đăng nhập trên bản triển khai này.");

export class UnavailableAuthService implements AuthenticationService {
  register(input: RegisterInput): Promise<AuthUser> {
    validateRegistration(input);
    return Promise.reject(configurationError());
  }

  login(input: LoginInput): Promise<AuthUser> {
    validateLogin(input);
    return Promise.reject(configurationError());
  }

  logout(): Promise<void> {
    return Promise.reject(configurationError());
  }

  requestPasswordReset(email: string): Promise<void> {
    validateResetEmail(email);
    return Promise.reject(configurationError());
  }

  observeAuthState(observer: AuthStateObserver, _onError?: AuthErrorObserver): Unsubscribe {
    queueMicrotask(() => observer(null));
    return () => undefined;
  }
}
