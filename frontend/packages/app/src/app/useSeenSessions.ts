import { useEffect, useRef } from "react";
import { chatKey } from "@lingzhu/ui/domain/chat";
import { type SessionInfo, type WorkspaceInfo } from "@lingzhu/ui/types";
import { useTabsStore } from "../store/tabs";

interface Options {
  workspaceList: WorkspaceInfo[];
  sessionsByWorkspace: Record<string, SessionInfo[]>;
  activeKey?: string;
}

/**
 * Seeds the "seen" stamp for each session. Called once from the shell bridge;
 * the stamps themselves live in the tabs store so unread selectors can read
 * them without subscribing to chat updates.
 *
 * The write is idempotent and happens outside the effect's dependencies: it
 * keys on the session rows, and writing `seen` re-renders every subscriber,
 * which would otherwise feed a fresh row object back in and re-run the effect.
 */
export function useSeenSessions({ workspaceList, sessionsByWorkspace, activeKey }: Options) {
  const written = useRef<string>("");
  useEffect(() => {
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

    for (const workspace of workspaceList) {
      for (const session of sessionsByWorkspace[workspace.path] ?? []) {
        const key = chatKey(workspace.path, session.id);
        if (next[key] === undefined) remember(key, session.updated);
      }
    }
    if (activeKey) {
      const [path, id] = activeKey.split("\u0000");
      const session = sessionsByWorkspace[path]?.find((entry) => entry.id === id);
      if (session) remember(activeKey, session.updated);
    }

    if (!changed) return;
    // Skip a write whose result this hook already produced, so a re-render that
    // carries the same rows cannot push the same record back into the store.
    const signature = Object.keys(next)
      .sort()
      .map((key) => `${key}=${next[key]}`)
      .join("\u0001");
    if (written.current === signature) return;
    written.current = signature;
    store.markSeen(next);
  }, [workspaceList, sessionsByWorkspace, activeKey]);
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
