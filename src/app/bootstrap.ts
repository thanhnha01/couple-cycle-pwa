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
import { setupPwa } from "../pwa/setupPwa";
import { createRepositories } from "../storage/repositories";
import { IndexedDbPeriodStore } from "../sync/indexedDbPeriodStore";
import { OfflinePeriodService } from "../sync/offlinePeriodService";
import { subscribeRealtimeCouple } from "../sync/realtimeCouple";
import type { Presence } from "../couple/types";
import type { SyncOperation, SyncState } from "../sync/types";
import { CoupleEventService } from "../events/service";
import type { CoupleEvent } from "../events/types";
import { DailyConnectionService } from "../daily/service";
import type { PrivateCheckIn, SharedTask } from "../daily/types";
import { notifyDueEvents } from "../notifications/eventReminders";
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
  const repositories = createRepositories();
  const periodService = new OfflinePeriodService({
    store: new IndexedDbPeriodStore(),
    remote: isFirebaseConfigured ? new FirebasePeriodRepository() : undefined,
    onChange: (nextPeriods, nextState, nextOperations) => {
      periods = [...nextPeriods]; syncState = nextState; syncOperations = [...nextOperations];
      periodsLoading = false; render();
    },
  });
  const coupleSession = new CoupleSessionStore(couples);
  const eventService = new CoupleEventService(isFirebaseConfigured);
  const dailyService = new DailyConnectionService(isFirebaseConfigured);
  let currentRoute: AppRoute = routes[0]!;
  let loadedUid: string | undefined;
  let currentInvite: InviteDetails | undefined;
  let inviteLoading = false;
  let periods: Period[] = [];
  let periodsLoading = false;
  let periodsError = false;
  let loadedPeriodsCoupleId: string | undefined;
  let syncState: SyncState = isFirebaseConfigured ? "synced" : "offline";
  let syncOperations: SyncOperation[] = [];
  let presence: Presence[] = [];
  let events: CoupleEvent[] = [];
  let sharedTasks: SharedTask[] = [];
  let privateCheckins: PrivateCheckIn[] = [];
  let stopEvents: (() => void) | undefined;
  let stopTasks: (() => void) | undefined;
  let stopCheckins: (() => void) | undefined;
  let stopRealtime: (() => void) | undefined;
  let activeCoupleId: string | undefined;

  let router: ReturnType<typeof createRouter>;
  const resetActiveCouple = (): void => {
    stopRealtime?.();
    stopRealtime = undefined;
    activeCoupleId = undefined;
    presence = [];
    events = [];
    stopEvents?.();
    stopEvents = undefined;
    sharedTasks = [];
    privateCheckins = [];
    stopTasks?.();
    stopTasks = undefined;
    stopCheckins?.();
    stopCheckins = undefined;
    periods = [];
    loadedPeriodsCoupleId = undefined;
    coupleSession.reset();
    periodService.reset();
  };
  const refreshPeriods = async (): Promise<void> => {
    if (coupleSession.snapshot.status !== "linked") return;
    periodsLoading = true;
    periodsError = false;
    render();
    try {
      periods = await periodService.restore(coupleSession.snapshot.membership.coupleId);
      loadedPeriodsCoupleId = coupleSession.snapshot.membership.coupleId;
      void periodService.replay();
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

    if (coupleSession.snapshot.status === "linked" && loadedPeriodsCoupleId !== coupleSession.snapshot.membership.coupleId && !periodsLoading) {
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
      syncState,
      syncOperations,
      presence,
      events,
      eventService,
      sharedTasks,
      privateCheckins,
      dailyService,
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
      resetActiveCouple();
      loadedUid = state.user.uid;
      currentInvite = undefined;
      const requestedUid = state.user.uid;
      void restoreCachedMembership(requestedUid, repositories).then((cached) => {
        if (loadedUid !== requestedUid) return;
        if (cached) coupleSession.setMembership(cached);
        return coupleSession.load(requestedUid);
      });
    } else if (state.status !== "authenticated" && loadedUid) {
      loadedUid = undefined;
      currentInvite = undefined;
      resetActiveCouple();
    }
    render();
  });
  coupleSession.subscribe((session) => {
    if (session.status === "linked") {
      const { membership } = session;
      void cacheMembership(membership, stateUserId(authSession), repositories);
      if (isFirebaseConfigured && activeCoupleId !== membership.coupleId && authSession.snapshot.status === "authenticated") {
        stopRealtime?.();
        activeCoupleId = membership.coupleId;
        stopRealtime = subscribeRealtimeCouple(membership.coupleId, authSession.snapshot.user.uid, {
          profile: (profile) => { if (profile) coupleSession.updateProfile(profile); },
          periods: (remotePeriods) => { void periodService.applyRemote(remotePeriods).catch(() => { periodsError = true; render(); }); },
          presence: (nextPresence) => { presence = nextPresence; render(); },
        });
      }
      if (!stopEvents) {
        stopEvents = eventService.subscribe(membership.coupleId, (nextEvents) => { events = nextEvents; notifyDueEvents(events); render(); });
      }
      if (!stopTasks) {
        stopTasks = dailyService.subscribeTasks(membership.coupleId, (nextTasks) => { sharedTasks = nextTasks; render(); });
      }
      if (!stopCheckins && authSession.snapshot.status === "authenticated") {
        stopCheckins = dailyService.subscribeCheckins(authSession.snapshot.user.uid, (nextCheckins) => { privateCheckins = nextCheckins.filter((checkin) => checkin.coupleId === membership.coupleId); render(); });
      }
      void periodService.replay();
    }
    render();
  });
  authSession.start();
  router.start();
  await setupPwa();
}

function stateUserId(session: AuthSessionStore): string {
  return session.snapshot.status === "authenticated" ? session.snapshot.user.uid : "";
}

async function restoreCachedMembership(uid: string, repositories: ReturnType<typeof createRepositories>): Promise<CoupleMembership | undefined> {
  try {
    const member = (await repositories.members.list()).find((item) => item.userId === uid);
    if (!member) return undefined;
    const couple = await repositories.couples.get(member.coupleId);
    return couple ? { coupleId: member.coupleId, profile: { name: couple.name, createdAt: couple.createdAt, ownerUid: couple.ownerUid, memberCount: couple.memberCount }, member: { role: member.role, joinedAt: member.joinedAt } } : undefined;
  } catch { return undefined; }
}

async function cacheMembership(membership: CoupleMembership, uid: string, repositories: ReturnType<typeof createRepositories>): Promise<void> {
  if (!uid) return;
  try {
    await Promise.all([
      repositories.couples.save({ id: membership.coupleId, ...membership.profile }),
      repositories.members.save({ id: `${membership.coupleId}:${uid}`, coupleId: membership.coupleId, userId: uid, ...membership.member }),
    ]);
  } catch { /* Cache loss must not block the verified remote session. */ }
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
