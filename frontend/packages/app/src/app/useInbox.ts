import { createMemo, type Accessor } from "solid-js";
import { api } from "../lib/api";
import { messageOf } from "../lib/errors";
import { chatKey } from "@lingzhu/ui/domain/chat";
import { type InboxItem } from "@lingzhu/ui/types";
import { notify } from "../store/notify";
import { useChatStore } from "../store/chat";

interface Options {
  workspace: Accessor<string | undefined>;
  sessionID: Accessor<string | undefined>;
  restorePrompt: (text: string) => void;
}

/**
 * Pending input for one session. The durable inbox projection in the chat
 * store is the single source for both the composer queue and the pending
 * steer rows, so a send, delivery change or cancellation updates both views
 * in the same state update.
 */
export function useInbox({ workspace, sessionID, restorePrompt }: Options) {
  const key = createMemo(() => {
    const path = workspace();
    const id = sessionID();
    return path && id ? chatKey(path, id) : "";
  });
  const inbox = useChatStore((state) => {
    const current = key();
    return current ? state.chats[current]?.inbox : undefined;
  });

  const removeInboxItem = async (id: string) => {
    const path = workspace();
    const current = sessionID();
    if (!path || !current) return;
    try {
      await api.cancelInbox(path, current, id);
      useChatStore.getState().removeInboxInput(path, current, id);
    } catch (error) {
      notify(messageOf(error));
    }
  };

  const toggleInboxDelivery = async (item: InboxItem) => {
    const path = workspace();
    const current = sessionID();
    if (!path || !current) return;
    const next = item.delivery === "steer" ? "queue" : "steer";
    try {
      await api.updateInbox(path, current, item.id, next);
      useChatStore.getState().setInboxDelivery(path, current, item.id, next);
    } catch (error) {
      notify(messageOf(error));
    }
  };

  /** Pull a queued prompt back into the editor instead of waiting for delivery. */
  const editInboxItem = async (item: InboxItem) => {
    const path = workspace();
    const current = sessionID();
    if (!path || !current) return;
    try {
      await api.cancelInbox(path, current, item.id);
      useChatStore.getState().removeInboxInput(path, current, item.id);
      restorePrompt(item.payload.text);
    } catch (error) {
      notify(messageOf(error));
    }
  };

  return { inbox: createMemo(() => inbox() ?? []), removeInboxItem, toggleInboxDelivery, editInboxItem };
}
