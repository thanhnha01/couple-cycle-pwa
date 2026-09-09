import type { AuthSessionState } from "../auth/session";
import type { CoupleSessionState } from "../couple/session";
import { protectedPaths, publicAuthPaths, type RoutePath } from "./routes";

export function guardedDestination(
  path: RoutePath,
  session: AuthSessionState,
  couple: CoupleSessionState = { status: "initializing" },
): RoutePath | undefined {
  if (session.status === "initializing") return undefined;
  if (session.status === "unauthenticated" && protectedPaths.includes(path)) return "/login";
  if (session.status === "authenticated" && publicAuthPaths.includes(path)) return "/onboarding";
  if (session.status === "authenticated" && couple.status === "unlinked" && path !== "/onboarding") return "/onboarding";
  if (session.status === "authenticated" && couple.status === "linked" && path === "/onboarding") return "/home";
  return undefined;
}
