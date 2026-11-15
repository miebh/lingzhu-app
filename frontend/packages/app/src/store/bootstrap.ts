import { api } from "../lib/api";
import { useCatalogStore } from "./catalog";
import { useChatStore } from "./chat";
import { usePreferencesStore } from "./preferences";
import { useWorkspaceStore } from "./workspaces";

let started = false;

/**
 * One-time app start: subscribe to core events, then load local state. The
 * guard keeps React strict-mode double mounts from double-subscribing.
 */
export function startApp() {
  if (started) return;
  started = true;

  api.onEvent((event) => useChatStore.getState().handleEvent(event));

  void useCatalogStore.getState().reload();

  // Preferences decide the startup workspace, so the first read waits for them.
  void usePreferencesStore
    .getState()
    .hydrate()
    .then(() => useWorkspaceStore.getState().refresh());
}
