import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "/couple-cycle-pwa/",
  build: {
    target: "es2022",
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
