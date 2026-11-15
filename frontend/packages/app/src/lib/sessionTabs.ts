import { chatKey, type SessionInfo } from "@lingzhu/ui/types";

export interface StoredSessionTab {
  key: string;
  path: string;
  sessionID: string;
}

export type SideTabKind = "chat" | "settings";

/** One tab in the shell's rail or top strip. */
export interface SideTab {
  key: string;
  /** Session identifier, absent for drafts and settings tabs. */
  sessionID?: string;
  label: string;
  subtitle?: string;
  /** Workspace path shown under the title in the hover preview. */
  directory?: string;
  kind: SideTabKind;
  /** A draft session that has not been started yet. */
  draft?: boolean;
  status?: "ongoing" | "warning" | "failed";
  /** Finished in the background since it was last active. */
  unread?: boolean;
  closable: boolean;
}

export interface ClosedSideTab {
  key: string;
  label: string;
  subtitle?: string;
}

/**
 * Removes tabs owned by deleted sessions and resolves where the rail should
 * go when the active tab was one of them. The next tab takes the removed
 * index, otherwise the previous one; no target means Home.
 */
export function removeTabsForSessions(
  tabs: StoredSessionTab[],
  entries: Array<{ path: string; id: string }>,
  activeKey: string | undefined,
) {
  const keys = new Set(entries.map((entry) => chatKey(entry.path, entry.id)));
  const index = activeKey ? tabs.findIndex((tab) => tab.key === activeKey) : -1;
  const next = tabs.filter((tab) => !keys.has(tab.key));
  const removedActive = !!activeKey && keys.has(activeKey);
  const target = removedActive ? (next[index] ?? next[index - 1]) : undefined;

  return { next, target, removedActive };
}

/**
 * The complete decision for one tab's Delete action. Drafts never reach the
 * core; durable sessions use the loaded row when available and otherwise a
 * minimal row built from the persisted tab.
 */
export function planTabDelete(input: {
  tab: { key: string; label: string };
  entry: StoredSessionTab;
  tabs: StoredSessionTab[];
  activeKey: string | undefined;
  sessions: SessionInfo[] | undefined;
  chats: Record<string, { draft?: boolean } | undefined>;
}) {
  const draft = !!input.chats[input.tab.key]?.draft;
  const loaded = input.sessions?.find((item) => item.id === input.entry.sessionID);
  const session =
    loaded ??
    ({ id: input.entry.sessionID, title: input.tab.label || "Session", updated: "" } satisfies SessionInfo);
  const removal = removeTabsForSessions(input.tabs, [{ path: input.entry.path, id: input.entry.sessionID }], input.activeKey);

  return { draft, known: !!loaded, session, ...removal };
}
