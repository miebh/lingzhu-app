import { api } from "../lib/api";
import { messageOf } from "../lib/errors";
import { chatKey } from "@lingzhu/ui/domain/chat";
import { type InboxItem } from "@lingzhu/ui/types";
import { notify } from "../store/notify";
import { useChatStore } from "../store/chat";

interface Options {
  workspace?: string;
  sessionID?: string;
  restorePrompt: (text: string) => void;
}

/**
 * Pending input for one session. The durable inbox projection in the chat
 * store is the single source for both the composer queue and the pending
 * steer rows, so a send, delivery change or cancellation updates both views
 * in the same state update.
 */
export function useInbox({ workspace, sessionID, restorePrompt }: Options) {
  const key = workspace && sessionID ? chatKey(workspace, sessionID) : "";
  const inbox = useChatStore((state) => (key ? state.chats[key]?.inbox : undefined));
  const removeInboxInput = useChatStore((state) => state.removeInboxInput);
  const setInboxDelivery = useChatStore((state) => state.setInboxDelivery);

  const removeInboxItem = async (id: string) => {
    if (!workspace || !sessionID) return;
    try {
      await api.cancelInbox(workspace, sessionID, id);
      removeInboxInput(workspace, sessionID, id);
    } catch (error) {
      notify(messageOf(error));
    }
  };

  const toggleInboxDelivery = async (item: InboxItem) => {
    if (!workspace || !sessionID) return;
    const next = item.delivery === "steer" ? "queue" : "steer";
    try {
      await api.updateInbox(workspace, sessionID, item.id, next);
      setInboxDelivery(workspace, sessionID, item.id, next);
    } catch (error) {
      notify(messageOf(error));
    }
  };

  /** Pull a queued prompt back into the editor instead of waiting for delivery. */
  const editInboxItem = async (item: InboxItem) => {
    if (!workspace || !sessionID) return;
    try {
      await api.cancelInbox(workspace, sessionID, item.id);
      removeInboxInput(workspace, sessionID, item.id);
      restorePrompt(item.payload.text);
    } catch (error) {
      notify(messageOf(error));
    }
  };

  return { inbox: inbox ?? [], removeInboxItem, toggleInboxDelivery, editInboxItem };
}