interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function showNotice(message: string, action: string, onAction: () => void): void {
  const host = document.querySelector<HTMLElement>("#pwa-notices");
  if (!host) return;

  const notice = document.createElement("div");
  notice.className = "pwa-notice";

  const text = document.createElement("span");
  text.textContent = message;

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = action;
  button.addEventListener("click", onAction, { once: true });

  notice.append(text, button);
  host.append(notice);
}

export async function setupPwa(): Promise<void> {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    const installEvent = event as BeforeInstallPromptEvent;
    showNotice("Cài Nhịp Đôi để mở nhanh hơn.", "Cài đặt", () => {
      void installEvent.prompt();
    });
  });

  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;

  try {
    const registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL,
    });

    const offerUpdate = (worker: ServiceWorker): void => {
      showNotice("Phiên bản mới đã sẵn sàng.", "Cập nhật", () => {
        worker.postMessage({ type: "SKIP_WAITING" });
      });
    };

    if (registration.waiting) offerUpdate(registration.waiting);

    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) offerUpdate(worker);
      });
    });

    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  } catch (error) {
    console.warn("Service worker registration failed.", error);
  }
}
