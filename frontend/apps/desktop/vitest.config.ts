import { defineConfig } from "vitest/config";
import solid from "vite-plugin-solid";
import { sharedAliases } from "./vite.shared";

export default defineConfig({
  ssr: {
    resolve: {
      conditions: ["browser", "development"],
    },
  },
  resolve: {
    conditions: ["browser", "development", "solid"],
    dedupe: ["solid-js"],
    alias: sharedAliases,
  },
  plugins: [solid()],
  test: {
    environment: "jsdom",
    server: {
      deps: {
        inline: [/solid-js/, /@solidjs/, /@kobalte/, /solid-markdown/],
      },
    },
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "../../packages/*/src/**/*.test.{ts,tsx}"],
    globals: false,
  },
});
