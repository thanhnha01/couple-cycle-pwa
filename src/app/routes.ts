export const routePaths = [
  "/login",
  "/register",
  "/forgot-password",
  "/onboarding",
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
  { path: "/login", title: "Welcome back", eyebrow: "Account", description: "Sign-in will be connected in the authentication phase." },
  { path: "/register", title: "Create an account", eyebrow: "Account", description: "Registration is reserved for the authentication phase." },
  { path: "/forgot-password", title: "Reset your password", eyebrow: "Account", description: "Password recovery will be connected with Firebase Authentication later." },
  { path: "/onboarding", title: "Set up your shared space", eyebrow: "Getting started", description: "Couple invitations and joining will be implemented in a later phase." },
  { path: "/home", title: "Your cycle, together", eyebrow: "Today", description: "A calm shared overview will live here once cycle data is available." },
  { path: "/calendar", title: "Calendar", eyebrow: "Cycle", description: "Calendar tracking is intentionally not implemented in this foundation." },
  { path: "/insights", title: "Insights", eyebrow: "Patterns", description: "Predictions and insights will appear here after the domain logic is built." },
  { path: "/settings", title: "Settings", eyebrow: "Preferences", description: "Account, couple, privacy, and app preferences will be managed here." },
];
