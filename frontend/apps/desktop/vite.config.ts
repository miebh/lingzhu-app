import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { sharedAliases } from "./vite.shared";
import tailwindcss from "@tailwindcss/vite";
import wails from "@wailsio/runtime/plugins/vite";

// The desktop app owns the entry, Vite config and Wails bindings. Its output
// stays in frontend/dist because main.go embeds that directory.
export default defineConfig(({ mode }) => {
  const dev = mode === "development";

  return {
    root: import.meta.dirname,
    server: {
      host: "127.0.0.1",
      port: Number(process.env.WAILS_VITE_PORT) || 9245,
      strictPort: true,
    },
    resolve: {
      alias: sharedAliases,
    },
    plugins: [react(), tailwindcss(), wails(path.resolve(import.meta.dirname, "bindings"))],
    // A development build keeps React's development bundle: its errors name the
    // component and the fix, while the production bundle can only report a
    // minified code that says nothing about where it happened.
    define: dev ? { "process.env.NODE_ENV": JSON.stringify("development") } : undefined,
    build: {
      outDir: path.resolve(import.meta.dirname, "../../dist"),
      emptyOutDir: true,
    },
  };
});
