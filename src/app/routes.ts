export const routePaths = [
  "/login",
  "/register",
  "/forgot-password",
  "/onboarding",
  "/invite",
  "/home",
  "/calendar",
  "/insights",
  "/settings",
] as const;

export type RoutePath = (typeof routePaths)[number];

export interface AppRoute {
  path: RoutePath;
  title: string;
  eyebrow: string;
  description: string;
}

export const routes: readonly AppRoute[] = [
  { path: "/login", title: "Welcome back", eyebrow: "Account", description: "Sign in securely to continue." },
  { path: "/register", title: "Create an account", eyebrow: "Account", description: "Create your private Couple Cycle account." },
  { path: "/forgot-password", title: "Reset your password", eyebrow: "Account", description: "Request a secure password reset link." },
  { path: "/onboarding", title: "Set up your shared space", eyebrow: "Getting started", description: "Create a private couple or securely accept your partner’s invitation." },
  { path: "/invite", title: "Invite your partner", eyebrow: "Private invitation", description: "Share this one-time link only with your partner." },
  { path: "/home", title: "Your cycle, together", eyebrow: "Today", description: "A calm shared overview will live here once cycle data is available." },
  { path: "/calendar", title: "Calendar", eyebrow: "Cycle", description: "Calendar tracking is intentionally not implemented in this foundation." },
  { path: "/insights", title: "Insights", eyebrow: "Patterns", description: "Predictions and insights will appear here after the domain logic is built." },
  { path: "/settings", title: "Settings", eyebrow: "Preferences", description: "Account, couple, privacy, and app preferences will be managed here." },
];

export const publicAuthPaths: readonly RoutePath[] = ["/login", "/register", "/forgot-password"];
export const protectedPaths: readonly RoutePath[] = ["/onboarding", "/invite", "/home", "/calendar", "/insights", "/settings"];
