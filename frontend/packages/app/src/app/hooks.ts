import type { Accessor } from "solid-js";
import { createMemo } from "solid-js";
import { chatKey } from "@lingzhu/ui/domain/chat";
import { useChatStore } from "../store/chat";
import { useTabsStore } from "../store/tabs";
import { useWorkspaceStore, useSessionsByWorkspace, useWorkspaces } from "../store/workspaces";
import { usePreferences } from "../store/preferences";
import { buildHomeRows } from "./derive";
import { unreadKeys } from "./useSeenSessions";

export {
  useActiveChat,
  useActiveChatField,
  useAtHome,
  useAnyChatRunning,
  useChatMap,
} from "../store/chat";

/** Unread session keys, derived from seen stamps and the session rows. */
export function useUnreadKeys(activeKey: Accessor<string | undefined>) {
  const seen = useTabsStore((state) => state.seen);
  const sessions = useSessionsByWorkspace();
  // Subscribing to the session signature wakes the memo when a row's timestamp
  // changes; the memo reads the snapshot from the store.
  const signature = useWorkspaceStore((state) =>
    Object.entries(state.sessionsByWorkspace).flatMap(([path, list]) =>
      (list ?? []).map((session) => `${chatKey(path, session.id)}:${session.updated}`),
    ),
  );
  return createMemo(() => {
    signature();
    return unreadKeys(seen(), sessions(), activeKey());
  });
}

/** Home's recent rows; rebuilt only when a title, status or timestamp changes. */
export function useHomeRows() {
  const sessions = useSessionsByWorkspace();
  const workspaceList = useWorkspaces();
  const preferences = usePreferences();
  // The signature keeps the memo in step with chat status changes without
  // subscribing the caller to every chat object.
  const signature = useChatStore((state) =>
    Object.values(state.chats).map(
      (chat) => `${chat.title ?? ""}:${chat.draft ? 1 : 0}:${chat.running ? 1 : 0}`,
    ),
  );
  return createMemo(() => {
    signature();
    return buildHomeRows(sessions(), useChatStore.getState().chats, workspaceList(), preferences());
  });
}
