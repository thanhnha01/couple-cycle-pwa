const CACHE_VERSION = "nhip-doi-shell-v6";
const BASE_URL = new URL("./", self.location.href);
const assetUrl = (path) => new URL(path, BASE_URL).pathname;
const APP_SHELL = [
  assetUrl("./"),
  assetUrl("index.html"),
  assetUrl("offline.html"),
  assetUrl("manifest.webmanifest"),
  assetUrl("icons/icon-192.svg"),
  assetUrl("icons/icon-512.svg"),
  assetUrl("firebase-messaging-config.js"),
];

// FCM needs to live in the same service worker that owns this PWA scope.
// The configuration file is generated at production build time from public
// Firebase web config, never from the service-account credential.
try {
  importScripts(
    new URL("firebase-messaging-config.js", self.location.href).href,
    "https://www.gstatic.com/firebasejs/12.2.1/firebase-app-compat.js",
    "https://www.gstatic.com/firebasejs/12.2.1/firebase-messaging-compat.js",
  );
  if (self.__NHIP_DOI_FIREBASE_CONFIG__?.apiKey) {
    firebase.initializeApp(self.__NHIP_DOI_FIREBASE_CONFIG__);
    firebase.messaging().onBackgroundMessage((payload) => {
      const title = payload.notification?.title ?? "Nhịp Đôi";
      const options = {
        body: payload.notification?.body ?? "Bạn có một lời nhắc mới.",
        icon: assetUrl("icons/icon-192.svg"),
        badge: assetUrl("icons/badge.svg"),
        tag: payload.notification?.tag ?? "nhip-doi-reminder",
        data: { url: assetUrl("./") },
      };
      void self.registration.showNotification(title, options);
    });
  }
} catch (error) {
  console.warn("Firebase background messaging is unavailable.", error);
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => (await caches.match(assetUrl("index.html"))) ?? (await caches.match(assetUrl("offline.html")))),
    );
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
        }
        return response;
      });
      return cached ?? network;
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const existing = windows.find((client) => client.url.startsWith(BASE_URL.href));
      return existing ? existing.focus() : self.clients.openWindow(BASE_URL.href);
    }),
  );
});
