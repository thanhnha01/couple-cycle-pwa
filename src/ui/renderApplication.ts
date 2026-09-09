import type { AuthenticationService } from "../auth/contracts";
import { AuthError } from "../auth/errors";
import type { AuthSessionState } from "../auth/session";
import { SubmissionController, type SubmissionState } from "../auth/submission";
import type { AppRoute, RoutePath } from "../app/routes";

interface RenderContext {
  auth: AuthenticationService;
  session: AuthSessionState;
  firebaseConfigured: boolean;
  navigate: (path: RoutePath) => void;
}

const primaryNavigation: readonly [RoutePath, string][] = [
  ["/home", "Home"], ["/calendar", "Calendar"], ["/insights", "Insights"], ["/settings", "Settings"],
];
const routeHref = (path: RoutePath): string => `#${path}`;

function shell(content: string): string {
  return `<div class="app-shell">
    <header class="topbar"><a class="brand" data-route href="${routeHref("/home")}" aria-label="Couple Cycle home"><span class="brand-mark" aria-hidden="true">C</span><span>Couple Cycle</span></a></header>
    ${content}<div id="pwa-notices" class="pwa-notices" aria-live="polite"></div></div>`;
}

export function renderApplication(root: HTMLElement, route: AppRoute, context: RenderContext): void {
  if (context.session.status === "initializing") {
    root.innerHTML = shell(`<main class="auth-layout" aria-busy="true"><section class="auth-card auth-loading" aria-labelledby="auth-loading-title"><span class="loading-indicator" aria-hidden="true"></span><h1 id="auth-loading-title">Opening your private space</h1><p>Securely restoring your session…</p></section></main>`);
    return;
  }
  if (["/login", "/register", "/forgot-password"].includes(route.path)) {
    renderAuthRoute(root, route.path, context);
    return;
  }
  renderProtectedRoute(root, route, context);
}

function renderAuthRoute(root: HTMLElement, path: RoutePath, context: RenderContext): void {
  const titles: Record<string, string> = { "/login": "Welcome back", "/register": "Create your account", "/forgot-password": "Reset your password" };
  const forms: Record<string, string> = { "/login": loginForm(), "/register": registerForm(), "/forgot-password": resetForm() };
  const description = path === "/forgot-password"
    ? "Enter your email and we’ll send a secure reset link if an account is available."
    : "Calm, thoughtful cycle support—shared only with the person you choose.";
  root.innerHTML = shell(`<main class="auth-layout">
    <section class="auth-intro" aria-labelledby="auth-title"><p class="eyebrow">A private space for two</p><h1 id="auth-title">${titles[path] ?? "Account"}</h1><p class="description">${description}</p></section>
    <section class="auth-card">${!context.firebaseConfigured ? '<p class="configuration-note" role="status">Firebase configuration is required before authentication can be used.</p>' : ""}${forms[path] ?? ""}</section>
  </main>`);
  bindAuthForm(root, path, context);
  bindPasswordToggles(root);
}

function loginForm(): string {
  return `<form id="auth-form" novalidate>${field("email", "Email", "email", "email", "you@example.com")}${passwordField("password", "Password")}
    <div class="form-row"><a data-route href="${routeHref("/forgot-password")}">Forgot password?</a></div>${formStatusAndButton("Sign in")}
    <p class="auth-switch">New to Couple Cycle? <a data-route href="${routeHref("/register")}">Create an account</a></p></form>`;
}

function registerForm(): string {
  return `<form id="auth-form" novalidate>${field("displayName", "Display name", "text", "name", "Your name")}${field("email", "Email", "email", "email", "you@example.com")}
    ${passwordField("password", "Password", "Use at least 8 characters", "new-password")}${passwordField("passwordConfirmation", "Confirm password", "", "new-password")}
    ${formStatusAndButton("Create account")}<p class="auth-switch">Already have an account? <a data-route href="${routeHref("/login")}">Sign in</a></p></form>`;
}

function resetForm(): string {
  return `<form id="auth-form" novalidate>${field("email", "Email", "email", "email", "you@example.com")}${formStatusAndButton("Send reset link")}
    <p class="auth-switch"><a data-route href="${routeHref("/login")}">Back to sign in</a></p></form>`;
}

function field(id: string, label: string, type: string, autocomplete: string, placeholder: string): string {
  return `<div class="field"><label for="${id}">${label}</label><input id="${id}" name="${id}" type="${type}" autocomplete="${autocomplete}" placeholder="${placeholder}" aria-describedby="${id}-error" required><p class="field-error" id="${id}-error"></p></div>`;
}

function passwordField(id: string, label: string, hint = "", autocomplete = "current-password"): string {
  return `<div class="field"><label for="${id}">${label}</label><div class="password-input"><input id="${id}" name="${id}" type="password" autocomplete="${autocomplete}" aria-describedby="${id}-hint ${id}-error" required><button type="button" data-password-toggle="${id}" aria-label="Show ${label.toLowerCase()}">Show</button></div><p class="field-hint" id="${id}-hint">${hint}</p><p class="field-error" id="${id}-error"></p></div>`;
}

function formStatusAndButton(label: string): string {
  return `<p id="form-status" class="form-status" role="alert" aria-live="assertive" tabindex="-1"></p><button class="primary-button" type="submit"><span>${label}</span><span class="button-spinner" aria-hidden="true"></span></button>`;
}

function bindPasswordToggles(root: HTMLElement): void {
  for (const button of root.querySelectorAll<HTMLButtonElement>("[data-password-toggle]")) {
    button.addEventListener("click", () => {
      const id = button.dataset.passwordToggle;
      const input = id ? root.querySelector<HTMLInputElement>(`#${id}`) : null;
      if (!input) return;
      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      button.textContent = showing ? "Show" : "Hide";
      button.setAttribute("aria-label", `${showing ? "Show" : "Hide"} ${id === "passwordConfirmation" ? "password confirmation" : "password"}`);
      input.focus();
    });
  }
}

function bindAuthForm(root: HTMLElement, path: RoutePath, context: RenderContext): void {
  const form = root.querySelector<HTMLFormElement>("#auth-form");
  if (!form) return;
  const submission = new SubmissionController();
  form.querySelector<HTMLInputElement>("input")?.focus();

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearFormErrors(form);
    const values = new FormData(form);
    const value = (name: string): string => String(values.get(name) ?? "");
    const action = async (): Promise<void> => {
      if (path === "/login") {
        await context.auth.login({ email: value("email"), password: value("password") });
        context.navigate("/onboarding");
      } else if (path === "/register") {
        await context.auth.register({
          displayName: value("displayName"),
          email: value("email"),
          password: value("password"),
          passwordConfirmation: value("passwordConfirmation"),
        });
        context.navigate("/onboarding");
      } else {
        await context.auth.requestPasswordReset(value("email"));
        setStatus(form, "If an account is available for that email, a reset link is on its way.");
      }
    };
    void submission.run(action, (state) => updateSubmissionState(form, state)).catch((error: unknown) => showAuthError(form, error));
  });
}

function updateSubmissionState(form: HTMLFormElement, state: SubmissionState): void {
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!button) return;
  const loading = state === "loading";
  button.disabled = loading;
  button.setAttribute("aria-busy", String(loading));
  form.setAttribute("aria-busy", String(loading));
  if (loading) setStatus(form, "Please wait…");
}

function clearFormErrors(form: HTMLFormElement): void {
  for (const input of form.querySelectorAll<HTMLInputElement>("input")) input.removeAttribute("aria-invalid");
  for (const message of form.querySelectorAll<HTMLElement>(".field-error")) message.textContent = "";
  setStatus(form, "");
}

function showAuthError(form: HTMLFormElement, error: unknown): void {
  const controlled = error instanceof AuthError ? error : new AuthError("UNKNOWN", "Something went wrong. Please try again.");
  for (const [fieldName, message] of Object.entries(controlled.fieldErrors)) {
    const input = form.elements.namedItem(fieldName);
    if (input instanceof HTMLInputElement) input.setAttribute("aria-invalid", "true");
    const fieldError = form.querySelector<HTMLElement>(`#${fieldName}-error`);
    if (fieldError) fieldError.textContent = message;
  }
  setStatus(form, controlled.message);
  (form.querySelector<HTMLInputElement>('[aria-invalid="true"]') ?? form.querySelector<HTMLElement>("#form-status"))?.focus();
}

function setStatus(form: HTMLFormElement, message: string): void {
  const status = form.querySelector<HTMLElement>("#form-status");
  if (status) status.textContent = message;
}

function renderProtectedRoute(root: HTMLElement, route: AppRoute, context: RenderContext): void {
  const navigation = primaryNavigation
    .map(([path, label]) => `<a data-route href="${routeHref(path)}" ${route.path === path ? 'aria-current="page"' : ""}>${label}</a>`)
    .join("");
  root.innerHTML = shell(`<main class="page"><section class="placeholder-card" aria-labelledby="page-title"><p class="eyebrow">${route.eyebrow}</p><h1 id="page-title">${route.title}</h1><p class="description">${route.description}</p>
    ${route.path === "/onboarding" ? '<p class="onboarding-note">You’re signed in. Couple setup will arrive in Milestone 3.</p>' : ""}
    <div class="protected-actions"><button id="logout-button" class="secondary-button" type="button">Sign out</button><p id="logout-status" class="form-status" role="alert" aria-live="assertive"></p></div></section></main>
    <nav class="bottom-nav" aria-label="Primary navigation">${navigation}</nav>`);

  const button = root.querySelector<HTMLButtonElement>("#logout-button");
  button?.addEventListener("click", () => {
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    void context.auth.logout().then(() => context.navigate("/login")).catch(() => {
      button.disabled = false;
      button.setAttribute("aria-busy", "false");
      const status = root.querySelector<HTMLElement>("#logout-status");
      if (status) status.textContent = "We could not sign you out. Please try again.";
    });
  });
}
