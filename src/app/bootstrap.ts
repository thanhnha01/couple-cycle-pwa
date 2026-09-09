import { FirebaseAuthProvider } from "../auth/firebaseAuthProvider";
import { FirebaseUserProfileRepository } from "../auth/firebaseUserProfileRepository";
import { AuthService } from "../auth/service";
import { AuthSessionStore } from "../auth/session";
import { UnavailableAuthService } from "../auth/unavailableService";
import { FirebaseCoupleRepository } from "../couple/firebaseCoupleRepository";
import { CoupleService } from "../couple/service";
import { CoupleSessionStore } from "../couple/session";
import type { CoupleMembership, InviteDetails } from "../couple/types";
import type { Period } from "../cycle/types";
import { isFirebaseConfigured } from "../firebase/config";
import { FirebasePeriodRepository } from "../periods/firebasePeriodRepository";
import { PeriodService } from "../periods/service";
import { setupPwa } from "../pwa/setupPwa";
import { renderApplication } from "../ui/renderApplication";
import { guardedDestination } from "./routeGuards";
import { createRouter, queryFromHash } from "./router";
import { routes, type AppRoute } from "./routes";

export async function bootstrapApplication(): Promise<void> {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("Application root was not found.");

  const auth = isFirebaseConfigured
    ? new AuthService(new FirebaseAuthProvider(), new FirebaseUserProfileRepository())
    : new UnavailableAuthService();
  const authSession = new AuthSessionStore(auth);
  const couples = new CoupleService(new FirebaseCoupleRepository());
  const periodService = new PeriodService(new FirebasePeriodRepository());
  const coupleSession = new CoupleSessionStore(couples);
  let currentRoute: AppRoute = routes[0]!;
  let loadedUid: string | undefined;
  let currentInvite: InviteDetails | undefined;
  let inviteLoading = false;
  let periods: Period[] = [];
  let periodsLoading = false;
  let periodsError = false;
  let loadedPeriodsCoupleId: string | undefined;

  let router: ReturnType<typeof createRouter>;
  const refreshPeriods = async (): Promise<void> => {
    if (coupleSession.snapshot.status !== "linked") return;
    periodsLoading = true;
    periodsError = false;
    render();
    try {
      periods = await periodService.list(coupleSession.snapshot.membership.coupleId);
      loadedPeriodsCoupleId = coupleSession.snapshot.membership.coupleId;
    } catch {
      periodsError = true;
    } finally {
      periodsLoading = false;
      render();
    }
  };
  const render = (): void => {
    rememberInviteRoute(currentRoute);
    if (authSession.snapshot.status !== "initializing") {
      const redirect = guardedDestination(currentRoute.path, authSession.snapshot, coupleSession.snapshot);
      if (redirect && redirect !== currentRoute.path) {
        router.navigate(redirect);
        return;
      }
    }

    if (
      currentRoute.path === "/invite"
      && authSession.snapshot.status === "authenticated"
      && coupleSession.snapshot.status === "linked"
      && coupleSession.snapshot.membership.member.role === "owner"
      && !currentInvite
      && !inviteLoading
    ) {
      inviteLoading = true;
      void couples.getOwnerInvite(authSession.snapshot.user.uid, coupleSession.snapshot.membership.coupleId)
        .then((invite) => { currentInvite = invite; })
        .catch(() => undefined)
        .finally(() => { inviteLoading = false; render(); });
    }

    if (currentRoute.path === "/calendar" && coupleSession.snapshot.status === "linked" && loadedPeriodsCoupleId !== coupleSession.snapshot.membership.coupleId && !periodsLoading) {
      void refreshPeriods();
    }

    renderApplication(root, currentRoute, {
      auth,
      couples,
      authSession: authSession.snapshot,
      coupleSession: coupleSession.snapshot,
      invite: currentInvite,
      inviteLoading,
      firebaseConfigured: isFirebaseConfigured,
      navigate: (path) => router.navigate(path),
      setMembership: (membership: CoupleMembership, invite?: InviteDetails) => {
        currentInvite = invite;
        coupleSession.setMembership(membership);
      },
      setInvite: (invite: InviteDetails) => {
        currentInvite = invite;
        render();
      },
      periods,
      periodsLoading,
      periodsError,
      periodService,
      refreshPeriods,
      rerender: render,
    });
  };

  router = createRouter({
    routes,
    onRouteChange: (route) => {
      currentRoute = route;
      render();
    },
  });

  authSession.subscribe((state) => {
    if (state.status === "authenticated" && loadedUid !== state.user.uid) {
      loadedUid = state.user.uid;
      currentInvite = undefined;
      periods = [];
      loadedPeriodsCoupleId = undefined;
      void coupleSession.load(state.user.uid);
    } else if (state.status !== "authenticated" && loadedUid) {
      loadedUid = undefined;
      currentInvite = undefined;
      coupleSession.reset();
    }
    render();
  });
  coupleSession.subscribe(render);
  authSession.start();
  router.start();
  await setupPwa();
}

const PENDING_INVITE_ROUTE = "couple-cycle:pending-invite-route";

function rememberInviteRoute(route: AppRoute): void {
  if (route.path !== "/onboarding") return;
  const query = queryFromHash(window.location.hash);
  if (!query.get("couple") || !query.get("invite")) return;
  try {
    sessionStorage.setItem(PENDING_INVITE_ROUTE, window.location.hash.slice(1));
  } catch {
    // The link still works for users who are already authenticated.
  }
}
