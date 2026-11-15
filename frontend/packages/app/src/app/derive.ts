import { workspaceName } from "../lib/history";
import {
  chatKey,
  type AppPreferences,
  type ChatState,
  type HomeSessionRow,
  type InboxEntry,
  type SessionInfo,
  type SessionLocation,
  type WorkspaceInfo,
} from "@lingzhu/ui/types";

/**
 * The parent chain for the session header, resolved from the loaded session
 * lists so a renamed ancestor reads correctly.
 */
export function buildAncestors(
  location: SessionLocation | undefined,
  sessionsByWorkspace: Record<string, SessionInfo[]>,
): Array<{ id: string; title: string }> {
  if (!location?.parent) return [];
  const lookup = new Map<string, SessionInfo>();
  for (const list of Object.values(sessionsByWorkspace)) {
    for (const session of list ?? []) lookup.set(session.id, session);
  }
  const chain: Array<{ id: string; title: string }> = [];
  const seen = new Set<string>([location.sessionId]);
  let id: string | undefined = location.parent;
  while (id && !seen.has(id)) {
    seen.add(id);
    const info = lookup.get(id);
    const title = info?.title || (id === location.parent ? location.parentTitle : "") || "Session";
    chain.unshift({ id, title });
    id = info?.parent;
  }
  return chain;
}

/** Every session across connected workspaces, with its live status. */
export function buildInboxEntries(
  sessionsByWorkspace: Record<string, SessionInfo[]>,
  chats: Record<string, ChatState>,
): InboxEntry[] {
  const entries: InboxEntry[] = [];
  for (const [path, sessions] of Object.entries(sessionsByWorkspace)) {
    for (const session of sessions ?? []) {
      const chat = chats[chatKey(path, session.id)];
      const status: InboxEntry["status"] =
        chat && (chat.pending.length > 0 || chat.questions.length > 0)
          ? "needs"
          : chat?.running
            ? "working"
            : chat?.lastRunStatus === "failed"
              ? "failed"
              : "ready";
      entries.push({
        key: chatKey(path, session.id),
        workspace: path,
        sessionID: session.id,
        title: chat?.title || session.title || "New session",
        workspaceName: workspaceName(path),
        status,
        updated: session.updated ?? "",
      });
    }
  }
  return entries;
}

/** Home's recent list, named by the project overrides when present. */
export function buildHomeRows(
  sessionsByWorkspace: Record<string, SessionInfo[]>,
  chats: Record<string, ChatState>,
  workspaceList: WorkspaceInfo[],
  preferences: AppPreferences,
): HomeSessionRow[] {
  const rows: HomeSessionRow[] = [];
  for (const [path, sessions] of Object.entries(sessionsByWorkspace)) {
    for (const session of sessions ?? []) {
      const key = chatKey(path, session.id);
      rows.push({
        key,
        path,
        sessionID: session.id,
        title: chats[key]?.title || session.title || "New session",
        workspaceName: workspaceList.find((workspace) => workspace.path === path)?.name ?? workspaceName(path),
        icon: preferences.projectIcons[path] || undefined,
        color: preferences.projectColors[path] || undefined,
        updated: session.updated ?? "",
        running: chats[key]?.running ?? false,
      });
    }
  }
  return rows;
}

