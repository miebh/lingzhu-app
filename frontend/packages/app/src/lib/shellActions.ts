import { usePreferencesStore } from "../store/preferences";
import { useWorkspaceStore } from "../store/workspaces";
import { notify } from "../store/notify";
import { api } from "./api";

/** Focuses the composer's textarea, wherever it is mounted. */
export function focusComposer() {
  document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Message"]')?.focus();
}

/** Scrolls to the previous or next user message in the timeline. */
export function navigateMessage(offset: -1 | 1) {
  const entries = Array.from(document.querySelectorAll<HTMLElement>('[data-entry="user"]'));
  if (entries.length === 0) return;
  const index = entries.findIndex((entry) => entry.getBoundingClientRect().top >= 0);
  const target =
    index < 0
      ? entries[entries.length - 1]
      : entries[Math.min(Math.max(index + offset, 0), entries.length - 1)];
  target?.scrollIntoView({ block: "start", behavior: "smooth" });
}

/** Flips the auto-approve preference and reports the new state. */
export function toggleAutoApprove() {
  const store = usePreferencesStore.getState();
  const next = !store.preferences.autoApprove;
  void store.save({ ...store.preferences, autoApprove: next });
  notify(next ? "Auto-accepting permissions" : "Stopped auto-accepting permissions", "info");
}

/** Restarts a core instance and refreshes the workspace list once it settles. */
export function restartWorkspace(path: string) {
  void api.restartCore(path).then(() => useWorkspaceStore.getState().refresh());
}
