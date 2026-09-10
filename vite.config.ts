import { defineConfig } from "vitest/config";
import { loadEnv, type Plugin } from "vite";

function firebaseMessagingConfig(config: Record<string, string>): Plugin {
  return {
    name: "firebase-messaging-config",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "firebase-messaging-config.js",
        // Firebase web configuration is public by design; no service-account
        // credential or server secret is ever emitted into the browser bundle.
        source: `self.__NHIP_DOI_FIREBASE_CONFIG__ = ${JSON.stringify(config)};\n`,
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const config = {
    apiKey: env.VITE_FIREBASE_API_KEY ?? "",
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? "",
    databaseURL: env.VITE_FIREBASE_DATABASE_URL ?? "",
    projectId: env.VITE_FIREBASE_PROJECT_ID ?? "",
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? "",
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: env.VITE_FIREBASE_APP_ID ?? "",
  };
  return {
    base: "/couple-cycle-pwa/",
    plugins: [firebaseMessagingConfig(config)],
    build: { target: "es2022" },
    test: { environment: "node", include: ["src/**/*.test.ts"] },
  };
});
