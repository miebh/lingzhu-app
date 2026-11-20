import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { chatKey } from "@lingzhu/ui/domain/chat";
import {
  useChatMap,
  useChatStore,
  useActiveChat,
  useActiveChatField,
  useAtHome,
  useAnyChatRunning,
} from "../store/chat";
import { useTabsStore } from "../store/tabs";
import { useWorkspaceStore, useSessionsByWorkspace, useWorkspaces } from "../store/workspaces";
import { usePreferences } from "../store/preferences";
import { buildHomeRows } from "./derive";
import { unreadKeys } from "./useSeenSessions";

export { useActiveChat, useActiveChatField, useAtHome, useAnyChatRunning, useChatMap };

/** Unread session keys, derived from seen stamps and the session rows. */
export function useUnreadKeys(activeKey?: string) {
  const seen = useTabsStore((state) => state.seen);
  const sessions = useSessionsByWorkspace();
  // Subscribing to the session signature re-renders the caller when a row's
  // timestamp changes; the memo reads the snapshot from the store.
  useWorkspaceStore(
    useShallow((state) =>
      Object.entries(state.sessionsByWorkspace).flatMap(([path, list]) =>
        (list ?? []).map((session) => `${chatKey(path, session.id)}:${session.updated}`),
      ),
    ),
  );
  return useMemo(() => unreadKeys(seen, sessions, activeKey), [seen, sessions, activeKey]);
}

/** Home's recent rows; rebuilt only when a title, status or timestamp changes. */
export function useHomeRows() {
  const sessions = useSessionsByWorkspace();
  const workspaceList = useWorkspaces();
  const preferences = usePreferences();
  // The signature keeps the memo in step with chat status changes without
  // subscribing the caller to every chat object.
  const signature = useChatStore(
    useShallow((state) =>
      Object.values(state.chats).map((chat) => `${chat.title ?? ""}:${chat.draft ? 1 : 0}:${chat.running ? 1 : 0}`),
    ),
  );
  return useMemo(
    () => buildHomeRows(sessions, useChatStore.getState().chats, workspaceList, preferences),
    [sessions, workspaceList, preferences, signature.join("\u0002")],
  );
}

