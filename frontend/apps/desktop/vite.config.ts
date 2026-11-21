import path from "node:path";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { sharedAliases } from "./vite.shared";
import tailwindcss from "@tailwindcss/vite";
import wails from "@wailsio/runtime/plugins/vite";

// The desktop app owns the entry, Vite config and Wails bindings. Its output
// stays in frontend/dist because main.go embeds that directory.
export default defineConfig(({ mode }) => {
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
    plugins: [solid(), tailwindcss(), wails(path.resolve(import.meta.dirname, "bindings"))],
    build: {
      outDir: path.resolve(import.meta.dirname, "../../dist"),
      emptyOutDir: true,
    },
  };
});
