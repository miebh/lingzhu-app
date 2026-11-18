import { api } from "../lib/api";
import { notify } from "./notify";
import { openNoticeTarget } from "../lib/notice";
import { useCatalogStore } from "./catalog";
import { useChatStore } from "./chat";
import { usePreferencesStore } from "./preferences";
import { useWorkspaceStore } from "./workspaces";

let started = false;

/**
 * Re-reads the workspace list once the core answers and loads the session lists
 * that have none yet. Both lifecycle states land here: the cold start reports
 * "started" and a crash recovery reports "ready".
 */
async function reloadAfterCore() {
  await useWorkspaceStore.getState().refresh();
  await useWorkspaceStore.getState().prefetchSessions();
}

/**
 * One-time app start: subscribe to core events, then load local state. The
 * guard keeps React strict-mode double mounts from double-subscribing.
 */
export function startApp() {
  if (started) return;
  started = true;

  api.onEvent((event) => useChatStore.getState().handleEvent(event));

  // A desktop notification is the way back into the session it reported on:
  // the Go side focuses the window, and this reopens that conversation.
  api.onNotice((target) => openNoticeTarget(target));

  // Clicking a toast while the app was closed starts it with the payload, so
  // the first read after subscribing still lands on that session.
  void api
    .pendingNotice()
    .then((target) => {
      if (target) openNoticeTarget(target);
    })
    .catch(() => undefined);

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
      void reloadAfterCore();
      return;
    }
    if (status.state === "started") {
      // The window paints before the core answers, so the workspace list it
      // read at startup still says "starting". Re-read it, then load the
      // session lists that had nothing to read yet.
      void reloadAfterCore();
    }
  });

  void useCatalogStore.getState().reload();

  // Preferences decide the startup workspace, so the first read waits for them.
  void usePreferencesStore
    .getState()
    .hydrate()
    .then(() => useWorkspaceStore.getState().refresh());
}
