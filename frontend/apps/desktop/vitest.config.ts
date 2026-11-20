import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { sharedAliases } from "./vite.shared";

export default defineConfig({
  resolve: {
    alias: sharedAliases,
  },
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "../../packages/*/src/**/*.test.{ts,tsx}"],
    globals: false,
  },
});
