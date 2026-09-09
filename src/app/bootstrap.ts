import { createRouter } from "./router";
import { routes } from "./routes";
import { setupPwa } from "../pwa/setupPwa";
import { renderApplication } from "../ui/renderApplication";

export async function bootstrapApplication(): Promise<void> {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("Application root was not found.");

  const router = createRouter({
    routes,
    onRouteChange: (route) => renderApplication(root, route),
  });

  router.start();
  await setupPwa();
}
