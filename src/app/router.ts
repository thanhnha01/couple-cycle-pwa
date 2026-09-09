import type { AppRoute } from "./routes";

interface RouterOptions {
  routes: readonly AppRoute[];
  onRouteChange: (route: AppRoute) => void;
}

export interface Router {
  navigate(path: string): void;
  start(): void;
  stop(): void;
}

export function createRouter({ routes, onRouteChange }: RouterOptions): Router {
  const fallback = routes.find((route) => route.path === "/home") ?? routes[0];
  if (!fallback) throw new Error("At least one application route is required.");

  const resolve = (path: string): AppRoute => routes.find((route) => route.path === path) ?? fallback;

  const renderCurrentRoute = (): void => {
    const requestedPath = window.location.pathname;
    const route = resolve(requestedPath);

    if (requestedPath === "/" || !routes.some((candidate) => candidate.path === requestedPath)) {
      window.history.replaceState({}, "", route.path);
    }

    document.title = `${route.title} · Couple Cycle`;
    onRouteChange(route);
  };

  const handleLinkClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const anchor = target.closest<HTMLAnchorElement>("a[data-route]");
    if (!anchor || anchor.origin !== window.location.origin) return;

    event.preventDefault();
    window.history.pushState({}, "", anchor.pathname);
    renderCurrentRoute();
  };

  return {
    navigate(path: string): void {
      window.history.pushState({}, "", resolve(path).path);
      renderCurrentRoute();
    },
    start(): void {
      window.addEventListener("popstate", renderCurrentRoute);
      document.addEventListener("click", handleLinkClick);
      renderCurrentRoute();
    },
    stop(): void {
      window.removeEventListener("popstate", renderCurrentRoute);
      document.removeEventListener("click", handleLinkClick);
    },
  };
}
