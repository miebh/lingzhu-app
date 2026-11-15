import { api } from "../lib/api";
import { notify } from "./notify";
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

  // A core that crashes is restarted in the background; the notice tells the
  // user why the app is briefly unavailable instead of failing silently.
  api.onCoreStatus((status) => {
    if (status.state === "restarting") {
      notify(
        status.attempt && status.attempt > 1
          ? `Restarting the core (attempt ${status.attempt})...`
          : "Restarting the core...",
        "info",
      );
      return;
    }
    if (status.state === "failed") {
      notify(`Core restart failed: ${status.error ?? "unknown error"}`);
      return;
    }
    if (status.state === "ready") {
      notify("Core is running again", "info");
      void useWorkspaceStore.getState().refresh();
    }
  });

  void useCatalogStore.getState().reload();

  // Preferences decide the startup workspace, so the first read waits for them.
  void usePreferencesStore
    .getState()
    .hydrate()
    .then(() => useWorkspaceStore.getState().refresh());
}
