import { createRouter } from "./router";
import { routes } from "./routes";
import { setupPwa } from "../pwa/setupPwa";
import { renderApplication } from "../ui/renderApplication";
import { FirebaseAuthProvider } from "../auth/firebaseAuthProvider";
import { FirebaseUserProfileRepository } from "../auth/firebaseUserProfileRepository";
import { AuthService } from "../auth/service";
import { AuthSessionStore } from "../auth/session";
import { UnavailableAuthService } from "../auth/unavailableService";
import { isFirebaseConfigured } from "../firebase/config";
import { guardedDestination } from "./routeGuards";
import type { AppRoute } from "./routes";

export async function bootstrapApplication(): Promise<void> {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("Application root was not found.");

  const auth = isFirebaseConfigured
    ? new AuthService(new FirebaseAuthProvider(), new FirebaseUserProfileRepository())
    : new UnavailableAuthService();
  const session = new AuthSessionStore(auth);
  let currentRoute: AppRoute = routes[0]!;

  let router: ReturnType<typeof createRouter>;
  const render = (): void => {
    if (session.snapshot.status !== "initializing") {
      const redirect = guardedDestination(currentRoute.path, session.snapshot);
      if (redirect && redirect !== currentRoute.path) {
        router.navigate(redirect);
        return;
      }
    }

    renderApplication(root, currentRoute, {
      auth,
      session: session.snapshot,
      firebaseConfigured: isFirebaseConfigured,
      navigate: (path) => router.navigate(path),
    });
  };

  router = createRouter({
    routes,
    onRouteChange: (route) => {
      currentRoute = route;
      render();
    },
  });

  session.subscribe(render);
  session.start();
  router.start();
  await setupPwa();
}
