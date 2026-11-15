import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { messageOf } from "../lib/errors";
import type { InboxItem } from "@lingzhu/ui/types";
import { notify } from "../store/notify";

interface Options {
  workspace?: string;
  sessionID?: string;
  /** Queued prompts change only while a turn runs, so they poll until it ends. */
  running: boolean;
  restorePrompt: (text: string) => void;
}

/** Queued prompts for the active session, shown above the composer. */
export function useInbox({ workspace, sessionID, running, restorePrompt }: Options) {
  const [inbox, setInbox] = useState<InboxItem[]>([]);

  useEffect(() => {
    if (!workspace || !sessionID) {
      setInbox([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const items = await api.inbox(workspace, sessionID);
        if (!cancelled) setInbox(items ?? []);
      } catch {
        if (!cancelled) setInbox([]);
      }
    };
    void load();
    // The queue only changes while a turn runs; poll it at the same cadence as
    // the reference's live inbox while the session is busy.
    const timer = running ? window.setInterval(() => void load(), 1500) : undefined;
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [workspace, sessionID, running]);

  const refreshInbox = async (path: string, id: string) => {
    try {
      setInbox((await api.inbox(path, id)) ?? []);
    } catch {
      setInbox([]);
    }
  };

  const removeInboxItem = async (id: string) => {
    if (!workspace || !sessionID) return;
    try {
      await api.cancelInbox(workspace, sessionID, id);
      await refreshInbox(workspace, sessionID);
    } catch (error) {
      notify(messageOf(error));
    }
  };

  const toggleInboxDelivery = async (item: InboxItem) => {
    if (!workspace || !sessionID) return;
    try {
      await api.updateInbox(workspace, sessionID, item.id, item.delivery === "steer" ? "queue" : "steer");
      await refreshInbox(workspace, sessionID);
    } catch (error) {
      notify(messageOf(error));
    }
  };

  /** Pull a queued prompt back into the editor instead of waiting for delivery. */
  const editInboxItem = async (item: InboxItem) => {
    if (!workspace || !sessionID) return;
    try {
      await api.cancelInbox(workspace, sessionID, item.id);
      restorePrompt(item.payload.text);
      await refreshInbox(workspace, sessionID);
    } catch (error) {
      notify(messageOf(error));
    }
  };

  return { inbox, removeInboxItem, toggleInboxDelivery, editInboxItem };
}
