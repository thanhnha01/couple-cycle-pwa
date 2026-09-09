import type {
  AuthenticationService,
  AuthErrorObserver,
  AuthProvider,
  AuthStateObserver,
  Unsubscribe,
  UserProfileRepository,
} from "./contracts";
import { AuthError, hasFirebaseErrorCode, mapFirebaseAuthError } from "./errors";
import type { AuthUser, LoginInput, RegisterInput } from "./types";
import { validateLogin, validateRegistration, validateResetEmail } from "./validation";

export class AuthService implements AuthenticationService {
  private readonly observers = new Set<AuthStateObserver>();
  private readonly errorObservers = new Set<AuthErrorObserver>();
  private providerUnsubscribe: Unsubscribe | undefined;
  private currentUser: AuthUser | null = null;
  private hasResolvedInitialState = false;
  private registrationPending = false;

  constructor(
    private readonly provider: AuthProvider,
    private readonly profiles: UserProfileRepository,
  ) {}

  async register(input: RegisterInput): Promise<AuthUser> {
    const validated = validateRegistration(input);
    this.registrationPending = true;
    let accountCreated = false;

    try {
      const user = await this.provider.register(validated.email, validated.password);
      accountCreated = true;
      try {
        await this.profiles.create(user.uid, { displayName: validated.displayName, email: validated.email });
      } catch {
        await this.rollbackIncompleteRegistration();
        this.registrationPending = false;
        this.publish(null);
        throw new AuthError(
          "PROFILE_CREATION_FAILED",
          "Your account setup could not be completed. Please try registering again.",
        );
      }

      this.registrationPending = false;
      const registeredUser = { ...user, displayName: validated.displayName };
      this.publish(registeredUser);
      return registeredUser;
    } catch (error) {
      this.registrationPending = false;
      if (error instanceof AuthError) throw error;
      if (accountCreated) this.publish(null);
      throw mapFirebaseAuthError(error, "register");
    }
  }

  async login(input: LoginInput): Promise<AuthUser> {
    const validated = validateLogin(input);
    try {
      return await this.provider.login(validated.email, validated.password);
    } catch (error) {
      throw mapFirebaseAuthError(error, "login");
    }
  }

  async logout(): Promise<void> {
    try {
      await this.provider.logout();
      this.publish(null);
    } catch (error) {
      throw mapFirebaseAuthError(error, "logout");
    }
  }

  async requestPasswordReset(value: string): Promise<void> {
    const email = validateResetEmail(value);
    try {
      await this.provider.requestPasswordReset(email);
    } catch (error) {
      // Treat an unknown account the same as a successful request to avoid account enumeration.
      if (hasFirebaseErrorCode(error, "auth/user-not-found")) return;
      throw mapFirebaseAuthError(error, "reset");
    }
  }

  observeAuthState(observer: AuthStateObserver, onError: AuthErrorObserver = () => undefined): Unsubscribe {
    this.observers.add(observer);
    this.errorObservers.add(onError);
    this.startProviderObserver();

    if (this.hasResolvedInitialState) queueMicrotask(() => observer(this.currentUser));

    return () => {
      this.observers.delete(observer);
      this.errorObservers.delete(onError);
    };
  }

  private startProviderObserver(): void {
    if (this.providerUnsubscribe) return;
    this.providerUnsubscribe = this.provider.observeAuthState(
      (user) => {
        if (this.registrationPending) return;
        this.publish(user);
      },
      (error) => {
        this.hasResolvedInitialState = true;
        for (const observer of this.errorObservers) observer(mapFirebaseAuthError(error, "login"));
      },
    );
  }

  private publish(user: AuthUser | null): void {
    this.currentUser = user;
    this.hasResolvedInitialState = true;
    for (const observer of this.observers) observer(user);
  }

  private async rollbackIncompleteRegistration(): Promise<void> {
    try {
      await this.provider.deleteCurrentUser();
    } catch {
      try {
        await this.provider.logout();
      } catch {
        // The controlled profile error remains the only UI-facing failure.
      }
    }
  }
}
