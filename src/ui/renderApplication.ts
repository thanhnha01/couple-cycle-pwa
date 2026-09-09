import type { AuthenticationService } from "../auth/contracts";
import { AuthError } from "../auth/errors";
import type { AuthSessionState } from "../auth/session";
import { SubmissionController, type SubmissionState } from "../auth/submission";
import type { AppRoute, RoutePath } from "../app/routes";
import { queryFromHash } from "../app/router";
import type { CoupleApplicationService } from "../couple/contracts";
import { CoupleError } from "../couple/errors";
import type { CoupleSessionState } from "../couple/session";
import type { CoupleMembership, InviteDetails } from "../couple/types";
import { bindCalendarPage, renderCalendarPage } from "../calendar/calendarPage";
import type { Period } from "../cycle/types";
import type { OfflinePeriodService } from "../sync/offlinePeriodService";
import type { SyncOperation, SyncState } from "../sync/types";
import type { Presence } from "../couple/types";
import { predictCycle } from "../cycle";

interface RenderContext {
  auth: AuthenticationService;
  couples: CoupleApplicationService;
  authSession: AuthSessionState;
  coupleSession: CoupleSessionState;
  invite: InviteDetails | undefined;
  inviteLoading: boolean;
  firebaseConfigured: boolean;
  navigate: (path: string) => void;
  setMembership: (membership: CoupleMembership, invite?: InviteDetails) => void;
  setInvite: (invite: InviteDetails) => void;
  periods: readonly Period[];
  periodsLoading: boolean;
  periodsError: boolean;
  periodService: OfflinePeriodService;
  refreshPeriods: () => Promise<void>;
  syncState: SyncState;
  syncOperations: readonly SyncOperation[];
  presence: readonly Presence[];
  rerender: () => void;
}

const primaryNavigation: readonly [RoutePath, string][] = [
  ["/home", "Home"], ["/calendar", "Calendar"], ["/history", "History"], ["/insights", "Insights"], ["/settings", "Settings"],
];
const routeHref = (path: RoutePath): string => `#${path}`;

function shell(content: string): string {
  return `<div class="app-shell">
    <header class="topbar"><a class="brand" data-route href="${routeHref("/home")}" aria-label="Couple Cycle home"><span class="brand-mark" aria-hidden="true">C</span><span>Couple Cycle</span></a></header>
    ${content}<div id="pwa-notices" class="pwa-notices" aria-live="polite"></div></div>`;
}

function syncLabel(state: SyncState): string {
  return ({ synced: "Synced", syncing: "Syncing", offline: "Offline", pending: "Pending", error: "Sync error" })[state];
}

function statusStrip(context: RenderContext): string {
  const partnerOnline = context.presence.some((person) => person.userId !== (context.authSession.status === "authenticated" ? context.authSession.user.uid : "") && person.state === "online");
  const conflicts = context.syncOperations.filter((operation) => operation.status === "conflict").length;
  return `<div class="connection-strip" role="status" aria-live="polite"><span class="sync-dot sync-${context.syncState}" aria-hidden="true"></span><span>${syncLabel(context.syncState)}</span><span class="partner-status">Partner ${partnerOnline ? "online" : "away"}</span>${conflicts ? `<button id="show-conflicts" class="text-button" type="button">${conflicts} conflict${conflicts === 1 ? "" : "s"}</button>` : ""}</div>`;
}

export function renderApplication(root: HTMLElement, route: AppRoute, context: RenderContext): void {
  if (context.authSession.status === "initializing") {
    root.innerHTML = shell(`<main class="auth-layout" aria-busy="true"><section class="auth-card auth-loading" aria-labelledby="auth-loading-title"><span class="loading-indicator" aria-hidden="true"></span><h1 id="auth-loading-title">Opening your private space</h1><p>Securely restoring your session…</p></section></main>`);
    return;
  }
  if (["/login", "/register", "/forgot-password"].includes(route.path)) {
    renderAuthRoute(root, route.path, context);
    return;
  }
  if (context.coupleSession.status === "initializing") {
    root.innerHTML = shell(`<main class="auth-layout" aria-busy="true"><section class="auth-card auth-loading" aria-labelledby="couple-loading-title"><span class="loading-indicator" aria-hidden="true"></span><h1 id="couple-loading-title">Checking your shared space</h1><p>Verifying couple membership…</p></section></main>`);
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
        context.navigate(pendingOnboardingDestination());
      } else if (path === "/register") {
        await context.auth.register({
          displayName: value("displayName"),
          email: value("email"),
          password: value("password"),
          passwordConfirmation: value("passwordConfirmation"),
        });
        context.navigate(pendingOnboardingDestination());
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
  if (context.coupleSession.status === "error") {
    root.innerHTML = shell(`<main class="page"><section class="placeholder-card"><p class="eyebrow">Membership check failed</p><h1>We couldn’t verify your shared space</h1><p class="description">Check your connection and try signing in again.</p><div class="protected-actions"><button id="logout-button" class="secondary-button" type="button">Sign out</button><p id="logout-status" class="form-status" role="alert" aria-live="assertive"></p></div></section></main>`);
    bindLogout(root, context);
    return;
  }

  if (route.path === "/onboarding" && context.coupleSession.status === "unlinked") {
    renderOnboarding(root, context);
    return;
  }

  if (route.path === "/invite" && context.coupleSession.status === "linked") {
    renderInvite(root, context, context.coupleSession.membership);
    return;
  }

  const navigation = primaryNavigation
    .map(([path, label]) => `<a data-route href="${routeHref(path)}" ${route.path === path ? 'aria-current="page"' : ""}>${label}</a>`)
    .join("");
  const membership = context.coupleSession.status === "linked" ? context.coupleSession.membership : undefined;
  if (route.path === "/calendar" && membership && context.authSession.status === "authenticated") {
    root.innerHTML = shell(`<main class="page">${statusStrip(context)}${renderCalendarPage({ periods: context.periods, loading: context.periodsLoading, error: context.periodsError, coupleId: membership.coupleId, uid: context.authSession.user.uid, service: context.periodService, refresh: context.refreshPeriods, rerender: context.rerender })}</main><nav class="bottom-nav" aria-label="Primary navigation">${navigation}</nav>`);
    bindCalendarPage(root, { periods: context.periods, loading: context.periodsLoading, error: context.periodsError, coupleId: membership.coupleId, uid: context.authSession.user.uid, service: context.periodService, refresh: context.refreshPeriods, rerender: context.rerender });
    bindSyncActions(root, context);
    return;
  }
  const page = route.path === "/home" ? homePage(context, membership) : route.path === "/history" ? historyPage(context) : route.path === "/insights" ? insightsPage(context) : settingsPage(context, membership);
  root.innerHTML = shell(`<main class="page">${statusStrip(context)}${page}</main>
    <nav class="bottom-nav" aria-label="Primary navigation">${navigation}</nav>`);

  bindLogout(root, context);
  bindSyncActions(root, context);
}

function bindSyncActions(root: HTMLElement, context: RenderContext): void {
  for (const button of root.querySelectorAll<HTMLButtonElement>("#settings-sync-retry, #show-conflicts")) {
    button.addEventListener("click", () => { button.disabled = true; void context.periodService.replay().finally(() => { button.disabled = false; context.rerender(); }); });
  }
}

function historyPage(context: RenderContext): string {
  const rows = [...context.periods].sort((a, b) => b.startDate.localeCompare(a.startDate)).map((period) => `<li><strong>${formatDate(period.startDate)}${period.endDate ? ` – ${formatDate(period.endDate)}` : ""}</strong><span>Actual record · revision ${period.revision}</span></li>`).join("");
  return `<section class="beta-page" aria-labelledby="page-title"><p class="eyebrow">Actual records</p><h1 id="page-title">Period history</h1>${context.periodsLoading ? "<p class=\"state-message\">Restoring local history…</p>" : context.periodsError ? "<p class=\"state-message error-state\">History is safe on this device, but could not be read. Try again from Calendar.</p>" : rows ? `<ol class="history-list">${rows}</ol>` : "<p class=\"state-message\">No periods recorded yet. Add your first actual period in Calendar.</p>"}</section>`;
}

function homePage(context: RenderContext, membership: CoupleMembership | undefined): string {
  const prediction = predictCycle({ periods: context.periods, asOfDate: localDate() });
  const upcoming = prediction.expectedDate ? `Expected around ${formatDate(prediction.expectedDate)}` : "Add a few periods to see a local estimate.";
  return `<section class="beta-page" aria-labelledby="page-title"><p class="eyebrow">Shared cycle journal</p><h1 id="page-title">A calmer way to stay in step.</h1><p class="lead">${escapeHtml(upcoming)}</p><div class="home-action"><a class="primary-link" data-route href="#/calendar">Log a period</a><span>Actual records stay private to your shared space.</span></div><section class="editorial-section"><div><p class="section-kicker">Your space</p><h2>${escapeHtml(membership?.profile.name ?? "Couple Cycle")}</h2></div><p>${context.presence.some((person) => person.state === "online") ? "Someone is here now." : "Your partner’s status updates when they reconnect."}</p></section><section class="actual-note"><strong>Recorded data</strong><span>${context.periods.length} actual period${context.periods.length === 1 ? "" : "s"} · predictions are calculated only on this device.</span></section></section>`;
}

function insightsPage(context: RenderContext): string {
  const prediction = predictCycle({ periods: context.periods, asOfDate: localDate() });
  const range = prediction.predictionWindow ? `${formatDate(prediction.predictionWindow.start)} – ${formatDate(prediction.predictionWindow.end)}` : "Not enough recorded history";
  return `<section class="beta-page" aria-labelledby="page-title"><p class="eyebrow">Pattern, not a promise</p><h1 id="page-title">Cycle insights</h1><section class="insight-feature"><p class="section-kicker">Next period estimate</p><h2>${escapeHtml(range)}</h2><p>${prediction.confidence.level === "insufficient" ? "Keep logging actual periods; estimates improve with consistent history." : `Confidence: ${prediction.confidence.level}. This is a cycle estimate, not medical advice.`}</p></section><dl class="insight-stats"><div><dt>Typical cycle</dt><dd>${prediction.cycleLength.expected ?? "—"}${prediction.cycleLength.expected ? " days" : ""}</dd></div><div><dt>Recorded periods</dt><dd>${context.periods.length}</dd></div></dl><p class="disclaimer">No fertility or ovulation claims are made. Predictions are derived locally and are never stored or shared as health records.</p></section>`;
}

function settingsPage(context: RenderContext, membership: CoupleMembership | undefined): string {
  const failures = context.syncOperations.filter((operation) => operation.status === "failed" || operation.status === "conflict");
  return `<section class="beta-page" aria-labelledby="page-title"><p class="eyebrow">Account & data</p><h1 id="page-title">Settings</h1><section class="settings-list"><div><strong>Shared space</strong><span>${escapeHtml(membership?.profile.name ?? "")}</span></div><div><strong>Local sync</strong><span>${syncLabel(context.syncState)}${context.syncOperations.length ? ` · ${context.syncOperations.length} pending` : ""}</span></div><div><strong>Partner</strong><span>${context.presence.some((person) => person.state === "online") ? "Online" : "Offline"}</span></div></section>${failures.length ? `<section class="conflict-panel" role="alert"><strong>Action needed</strong><p>${failures.length} sync change${failures.length === 1 ? " needs" : "s need"} review. Your local data was kept and no newer remote record was overwritten.</p><button id="settings-sync-retry" class="secondary-button" type="button">Retry sync</button></section>` : ""}<div class="protected-actions"><button id="logout-button" class="secondary-button" type="button">Sign out</button><p id="logout-status" class="form-status" role="alert" aria-live="assertive"></p></div></section>`;
}

function localDate(): import("../utils/date").CalendarDate { const value = new Date(); return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}` as import("../utils/date").CalendarDate; }
function formatDate(value: string): string { return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }

function renderOnboarding(root: HTMLElement, context: RenderContext): void {
  const query = queryFromHash(window.location.hash);
  const coupleId = query.get("couple") ?? "";
  const inviteCode = query.get("invite") ?? "";
  const hasInvitation = coupleId.length > 0 && inviteCode.length > 0;
  root.innerHTML = shell(`<main class="page onboarding-page">
    <section class="onboarding-heading" aria-labelledby="page-title"><p class="eyebrow">Getting started</p><h1 id="page-title">${hasInvitation ? "Join your partner" : "Create your shared space"}</h1><p class="description">Membership is private, limited to two people, and protected by a one-time invitation.</p></section>
    <div class="onboarding-grid">
      <section class="auth-card flow-card" aria-labelledby="create-title"><span class="step-mark" aria-hidden="true">1</span><h2 id="create-title">Create couple</h2><p>Start a private space and become its owner.</p>
        <form id="create-couple-form" novalidate>${coupleField("name", "Shared space name", "text", "Alex & Sam")}
          <p class="form-status" data-form-status role="alert" aria-live="assertive" tabindex="-1"></p><button class="primary-button" type="submit"><span>Create and invite</span><span class="button-spinner" aria-hidden="true"></span></button>
        </form></section>
      <section class="auth-card flow-card ${hasInvitation ? "highlighted-flow" : ""}" aria-labelledby="join-title"><span class="step-mark" aria-hidden="true">2</span><h2 id="join-title">Join partner</h2><p>${hasInvitation ? "This invitation is ready to be securely verified." : "Paste the couple ID and private code from your partner."}</p>
        <form id="join-couple-form" novalidate>${coupleField("coupleId", "Couple ID", "text", "Couple ID", coupleId)}${coupleField("inviteCode", "Private invite code", "text", "43-character code", inviteCode)}
          <p class="form-status" data-form-status role="alert" aria-live="assertive" tabindex="-1"></p><button class="primary-button" type="submit"><span>Accept invitation</span><span class="button-spinner" aria-hidden="true"></span></button>
        </form></section>
    </div>
    <div class="protected-actions"><button id="logout-button" class="secondary-button" type="button">Sign out</button><p id="logout-status" class="form-status" role="alert" aria-live="assertive"></p></div>
  </main>`);

  const uid = context.authSession.status === "authenticated" ? context.authSession.user.uid : "";
  bindCoupleForm(root.querySelector<HTMLFormElement>("#create-couple-form"), async (form) => {
    const name = String(new FormData(form).get("name") ?? "");
    const result = await context.couples.createCouple(uid, name);
    clearPendingInviteRoute();
    context.setMembership(result.membership, result.invite);
    context.navigate("/invite");
  });
  bindCoupleForm(root.querySelector<HTMLFormElement>("#join-couple-form"), async (form) => {
    const values = new FormData(form);
    const membership = await context.couples.joinCouple(uid, String(values.get("coupleId") ?? ""), String(values.get("inviteCode") ?? ""));
    clearPendingInviteRoute();
    context.setMembership(membership);
    context.navigate("/home");
  });
  bindLogout(root, context);
  if (hasInvitation) root.querySelector<HTMLButtonElement>("#join-couple-form button[type='submit']")?.focus();
}

function renderInvite(root: HTMLElement, context: RenderContext, membership: CoupleMembership): void {
  const isOwner = membership.member.role === "owner";
  const invite = context.invite;
  const inviteUrl = invite ? buildInviteUrl(invite) : "";
  const inviteContent = !isOwner
    ? `<p class="onboarding-note">Only the owner can view or replace invitations.</p><a class="primary-link" data-route href="${routeHref("/home")}">Return home</a>`
    : invite
      ? `<label for="share-link">One-time invite link</label><div class="share-row"><input id="share-link" type="text" readonly value="${escapeHtml(inviteUrl)}"><button id="copy-invite" class="secondary-button" type="button">Copy</button></div><p class="invite-expiry">Expires ${escapeHtml(new Date(invite.expiresAt).toLocaleString())}. Once accepted, it cannot be replayed.</p><div class="invite-actions"><button id="regenerate-invite" class="secondary-button" type="button">Replace invite</button><a class="primary-link" data-route href="${routeHref("/home")}">Continue home</a></div><p id="invite-status" class="form-status" role="status" aria-live="polite"></p>`
      : `<div class="inline-loading"><span class="loading-indicator" aria-hidden="true"></span><p>${context.inviteLoading ? "Loading your invitation…" : "No active invitation is available."}</p></div>`;

  root.innerHTML = shell(`<main class="page"><section class="placeholder-card invite-card" aria-labelledby="page-title"><p class="eyebrow">Private invitation</p><h1 id="page-title">Invite your partner</h1><p class="description">Share this link privately. The long secret in it is part of the security boundary.</p>${inviteContent}</section></main>`);

  root.querySelector<HTMLButtonElement>("#copy-invite")?.addEventListener("click", () => {
    void navigator.clipboard.writeText(inviteUrl).then(() => setInviteStatus(root, "Invitation copied.")).catch(() => setInviteStatus(root, "Copy failed. Select the link and copy it manually."));
  });
  const regenerate = root.querySelector<HTMLButtonElement>("#regenerate-invite");
  regenerate?.addEventListener("click", () => {
    regenerate.disabled = true;
    setInviteStatus(root, "Replacing the old invitation…");
    const uid = context.authSession.status === "authenticated" ? context.authSession.user.uid : "";
    void context.couples.regenerateInvite(uid, membership.coupleId).then((nextInvite) => {
      context.setInvite(nextInvite);
    }).catch((error: unknown) => {
      regenerate.disabled = false;
      setInviteStatus(root, coupleErrorMessage(error));
    });
  });
}

function bindCoupleForm(form: HTMLFormElement | null, action: (form: HTMLFormElement) => Promise<void>): void {
  if (!form) return;
  const submission = new SubmissionController();
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearCoupleForm(form);
    void submission.run(() => action(form), (state) => updateCoupleSubmission(form, state)).catch((error: unknown) => {
      showCoupleError(form, error);
    });
  });
}

function updateCoupleSubmission(form: HTMLFormElement, state: SubmissionState): void {
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!button) return;
  const loading = state === "loading";
  button.disabled = loading;
  button.setAttribute("aria-busy", String(loading));
  form.setAttribute("aria-busy", String(loading));
  if (loading) setCoupleFormStatus(form, "Please wait…");
}

function clearCoupleForm(form: HTMLFormElement): void {
  for (const input of form.querySelectorAll<HTMLInputElement>("input")) input.removeAttribute("aria-invalid");
  for (const message of form.querySelectorAll<HTMLElement>(".field-error")) message.textContent = "";
  setCoupleFormStatus(form, "");
}

function showCoupleError(form: HTMLFormElement, error: unknown): void {
  const controlled = error instanceof CoupleError ? error : new CoupleError("UNKNOWN", "Something went wrong. Please try again.");
  for (const [fieldName, message] of Object.entries(controlled.fieldErrors)) {
    const input = form.elements.namedItem(fieldName);
    if (input instanceof HTMLInputElement) input.setAttribute("aria-invalid", "true");
    const fieldError = form.querySelector<HTMLElement>(`#${fieldName}-error`);
    if (fieldError) fieldError.textContent = message;
  }
  setCoupleFormStatus(form, controlled.message);
  (form.querySelector<HTMLInputElement>('[aria-invalid="true"]') ?? form.querySelector<HTMLElement>("[data-form-status]"))?.focus();
}

function setCoupleFormStatus(form: HTMLFormElement, message: string): void {
  const status = form.querySelector<HTMLElement>("[data-form-status]");
  if (status) status.textContent = message;
}

function coupleField(id: string, label: string, type: string, placeholder: string, value = ""): string {
  return `<div class="field"><label for="${id}">${label}</label><input id="${id}" name="${id}" type="${type}" placeholder="${placeholder}" value="${escapeHtml(value)}" aria-describedby="${id}-error" required><p class="field-error" id="${id}-error"></p></div>`;
}

function buildInviteUrl(invite: InviteDetails): string {
  return `${window.location.origin}${window.location.pathname}#/onboarding?couple=${encodeURIComponent(invite.coupleId)}&invite=${encodeURIComponent(invite.code)}`;
}

function setInviteStatus(root: HTMLElement, message: string): void {
  const status = root.querySelector<HTMLElement>("#invite-status");
  if (status) status.textContent = message;
}

function coupleErrorMessage(error: unknown): string {
  return error instanceof CoupleError ? error.message : "Something went wrong. Please try again.";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/gu, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

function bindLogout(root: HTMLElement, context: RenderContext): void {

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

const PENDING_INVITE_ROUTE = "couple-cycle:pending-invite-route";

function pendingOnboardingDestination(): string {
  try {
    return sessionStorage.getItem(PENDING_INVITE_ROUTE) ?? "/onboarding";
  } catch {
    return "/onboarding";
  }
}

function clearPendingInviteRoute(): void {
  try {
    sessionStorage.removeItem(PENDING_INVITE_ROUTE);
  } catch {
    // Storage can be unavailable in hardened/private browser contexts.
  }
}
