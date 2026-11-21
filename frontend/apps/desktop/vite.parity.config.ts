import path from "node:path";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { sharedAliases } from "./vite.shared";
import tailwindcss from "@tailwindcss/vite";

// Builds the instrumented transcript page used by the browser parity harness.
export default defineConfig({
  root: import.meta.dirname,
  resolve: {
    alias: sharedAliases,
  },
  plugins: [solid(), tailwindcss()],
  build: {
    outDir: path.resolve(import.meta.dirname, "../../dist-parity"),
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(import.meta.dirname, "parity.html"),
    },
  },
});
