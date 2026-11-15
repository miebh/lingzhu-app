import path from "node:path";
import type { Alias } from "vite";

const desktop = import.meta.dirname;
const frontend = path.resolve(desktop, "../..");

/**
 * Aliases shared by the app, test and parity builds. Package paths resolve to
 * the workspace sources; the remaining entries keep the Shiki/TextMate
 * catalogs out of the bundle.
 */
export const sharedAliases: Alias[] = [
  { find: "@lingzhu/ui", replacement: path.resolve(frontend, "packages/ui/src") },
  { find: "@lingzhu/session-ui", replacement: path.resolve(frontend, "packages/session-ui/src") },
  { find: "@lingzhu/devtools", replacement: path.resolve(frontend, "packages/devtools/src") },
  { find: "@lingzhu/app", replacement: path.resolve(frontend, "packages/app/src") },
  { find: "@lingzhu/bindings", replacement: path.resolve(desktop, "bindings") },
  { find: "@", replacement: path.resolve(frontend, "packages/app/src") },
  {
    find: /^shiki\/langs$/,
    replacement: path.resolve(frontend, "packages/session-ui/src/highlight-catalogs-stub.ts"),
  },
  {
    find: /^@pierre\/theming\/themes$/,
    replacement: path.resolve(frontend, "packages/session-ui/src/highlight-catalogs-stub.ts"),
  },
  {
    find: /^@pierre\/highlights\/themes\/loader$/,
    replacement: path.resolve(frontend, "packages/session-ui/src/highlight-catalogs-stub.ts"),
  },
];
