import type { AppRoute } from "../app/routes";

const primaryNavigation = [
  ["/home", "Home"],
  ["/calendar", "Calendar"],
  ["/insights", "Insights"],
  ["/settings", "Settings"],
] as const;

export function renderApplication(root: HTMLElement, route: AppRoute): void {
  const navigation = primaryNavigation
    .map(
      ([path, label]) =>
        `<a data-route href="${path}" ${route.path === path ? 'aria-current="page"' : ""}>${label}</a>`,
    )
    .join("");

  root.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <a class="brand" data-route href="/home" aria-label="Couple Cycle home">
          <span class="brand-mark" aria-hidden="true">↻</span>
          <span>Couple Cycle</span>
        </a>
        <span class="foundation-badge">Foundation</span>
      </header>
      <main class="page">
        <section class="placeholder-card" aria-labelledby="page-title">
          <p class="eyebrow">${route.eyebrow}</p>
          <h1 id="page-title">${route.title}</h1>
          <p class="description">${route.description}</p>
          <div class="route-meta">
            <span>Route</span>
            <code>${route.path}</code>
          </div>
        </section>
        <nav class="account-links" aria-label="Foundation routes">
          <a data-route href="/login">Login</a>
          <a data-route href="/register">Register</a>
          <a data-route href="/forgot-password">Forgot password</a>
          <a data-route href="/onboarding">Onboarding</a>
        </nav>
      </main>
      <nav class="bottom-nav" aria-label="Primary navigation">${navigation}</nav>
      <div id="pwa-notices" class="pwa-notices" aria-live="polite"></div>
    </div>
  `;
}
