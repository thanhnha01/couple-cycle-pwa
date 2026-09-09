import type { AuthSessionState } from "../auth/session";
import { protectedPaths, publicAuthPaths, type RoutePath } from "./routes";

export function guardedDestination(path: RoutePath, session: AuthSessionState): RoutePath | undefined {
  if (session.status === "initializing") return undefined;
  if (session.status === "unauthenticated" && protectedPaths.includes(path)) return "/login";
  if (session.status === "authenticated" && publicAuthPaths.includes(path)) return "/onboarding";
  return undefined;
}
