import { createEffect, createMemo, type Accessor } from "solid-js";
import { chatKey } from "@lingzhu/ui/domain/chat";
import { type SessionInfo, type WorkspaceInfo } from "@lingzhu/ui/types";
import { useTabsStore } from "../store/tabs";

interface Options {
  workspaceList: Accessor<WorkspaceInfo[]>;
  sessionsByWorkspace: Accessor<Record<string, SessionInfo[]>>;
  activeKey: Accessor<string | undefined>;
}

/**
 * Seeds the "seen" stamp for each session. Called once from the shell bridge;
 * the stamps themselves live in the tabs store so unread selectors can read
 * them without subscribing to chat updates.
 *
 * The write is idempotent and keyed on the session rows: writing `seen` wakes
 * every subscriber, so the store snapshot is read untracked to keep that write
 * from feeding a fresh row back into this effect.
 */
export function useSeenSessions({ workspaceList, sessionsByWorkspace, activeKey }: Options) {
  // The shell getters are coarse, so each projection is memoised: the effect
  // below should wake on a new row set, not on a streamed token.
  const workspaces = createMemo(() => workspaceList());
  const sessions = createMemo(() => sessionsByWorkspace());
  const active = createMemo(() => activeKey());
  let written = "";
  createEffect(() => {
    const workspaceRows = workspaces();
    const sessionRows = sessions();
    const activeRow = active();
    const store = useTabsStore.getState();
    let next = store.seen;
    let changed = false;
    const remember = (key: string, updated: string) => {
      if (next[key] === updated) return;
      if (!changed) {
        next = { ...next };
        changed = true;
      }
      next[key] = updated;
    };

    for (const workspace of workspaceRows) {
      for (const session of sessionRows[workspace.path] ?? []) {
        const key = chatKey(workspace.path, session.id);
        if (next[key] === undefined) remember(key, session.updated);
      }
    }
    if (activeRow) {
      const [path, id] = activeRow.split("\u0000");
      const session = sessionRows[path]?.find((entry) => entry.id === id);
      if (session) remember(activeRow, session.updated);
    }

    if (!changed) return;
    // Skip a write whose result this hook already produced, so a re-run that
    // carries the same rows cannot push the same record back into the store.
    const signature = Object.keys(next)
      .sort()
      .map((key) => `${key}=${next[key]}`)
      .join("\u0001");
    if (written === signature) return;
    written = signature;
    store.markSeen(next);
  });
}

/** Unread keys derived from the seen stamps and the loaded session rows. */
export function unreadKeys(
  seen: Record<string, string>,
  sessionsByWorkspace: Record<string, SessionInfo[]>,
  activeKey?: string,
): Set<string> {
  const keys = new Set<string>();
  for (const [path, sessions] of Object.entries(sessionsByWorkspace)) {
    for (const session of sessions ?? []) {
      const key = chatKey(path, session.id);
      const stamp = seen[key];
      if (key !== activeKey && stamp !== undefined && stamp !== session.updated) keys.add(key);
    }
  }
  return keys;
}
