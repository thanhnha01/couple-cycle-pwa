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
  const fallback = routes.find((route) => route.path === "/login") ?? routes[0];
  if (!fallback) throw new Error("At least one application route is required.");

  const resolve = (path: string): AppRoute => routes.find((route) => route.path === path) ?? fallback;

  const renderCurrentRoute = (): void => {
    const requestedPath = pathFromHash(window.location.hash);
    const route = resolve(requestedPath);

    if (requestedPath === "/" || !routes.some((candidate) => candidate.path === requestedPath)) {
      window.history.replaceState({}, "", `${window.location.pathname}${window.location.search}#${route.path}`);
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
    const requestedPath = pathFromHash(anchor.hash);
    const destination = `#${resolve(requestedPath).path}`;
    if (window.location.hash === destination) renderCurrentRoute();
    else window.location.hash = destination;
  };

  return {
    navigate(path: string): void {
      const destination = `#${resolve(path).path}`;
      if (window.location.hash === destination) renderCurrentRoute();
      else window.location.hash = destination;
    },
    start(): void {
      window.addEventListener("hashchange", renderCurrentRoute);
      document.addEventListener("click", handleLinkClick);
      renderCurrentRoute();
    },
    stop(): void {
      window.removeEventListener("hashchange", renderCurrentRoute);
      document.removeEventListener("click", handleLinkClick);
    },
  };
}

export function pathFromHash(hash: string): string {
  const value = hash.startsWith("#") ? hash.slice(1) : hash;
  return value.startsWith("/") ? value : "/";
}
