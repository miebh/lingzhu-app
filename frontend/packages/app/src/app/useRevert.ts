import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { t } from "@lingzhu/ui/i18n";
import { useChatStore } from "../store/chat";
import { notify } from "../store/notify";

interface Options {
  workspace?: string;
  sessionID?: string;
  /** A completed turn adds checklist rows, so availability reloads with it. */
  entryCount: number;
  restorePrompt: (text: string) => void;
}

/**
 * Revert availability and the three revert actions. A staged revert hides the
 * tail of the conversation and the prompt returns to the composer.
 */
export function useRevert({ workspace, sessionID, entryCount, restorePrompt }: Options) {
  const refresh = useChatStore((state) => state.refresh);
  const [can, setCan] = useState({ undo: false, redo: false });

  const load = async (path: string, id: string) => {
    try {
      const state = await api.revertState(path, id);
      setCan({
        undo: !state.active && state.turns.some((turn) => turn.hasSnapshot),
        redo: state.active,
      });
    } catch {
      setCan({ undo: false, redo: false });
    }
  };

  useEffect(() => {
    if (!workspace || !sessionID) {
      setCan({ undo: false, redo: false });
      return;
    }
    void load(workspace, sessionID);
  }, [workspace, sessionID, entryCount]);

  /** Reverts the newest turn with a snapshot and returns its prompt to the composer. */
  const undoLatestTurn = async (path: string, id: string, restoreText?: string) => {
    const state = await api.revertState(path, id);
    const turn = [...state.turns]
      .reverse()
      .find((entry) => entry.hasSnapshot && entry.seq < (state.turnSeq ?? Number.MAX_SAFE_INTEGER));
    if (!turn) {
      notify(t("nothingToUndo"));
      return;
    }
    await api.revertSession(path, id, turn.seq);
    await refresh(path, id);
    await load(path, id);
    if (restoreText) restorePrompt(restoreText);
  };

  /** Stages a revert at one message and returns its prompt to the composer, as the reference does. */
  const revertToMessage = async (path: string, id: string, text: string, created?: string) => {
    const state = await api.revertState(path, id);
    const candidates = [...state.turns]
      .reverse()
      .filter((entry) => entry.hasSnapshot && entry.text.trim() === text.trim());
    const turn =
      candidates.find((entry) => !created || !entry.created || entry.created === created) ?? candidates[0];
    if (!turn) {
      notify(t("nothingToRevert"));
      return;
    }
    await api.revertSession(path, id, turn.seq);
    await refresh(path, id);
    await load(path, id);
    restorePrompt(text);
  };

  /** Restores the files and history hidden by a staged revert. */
  const redoLatestTurn = async (path: string, id: string) => {
    const state = await api.revertState(path, id);
    if (!state.active) {
      notify(t("notifyNothingToRedo"));
      return;
    }
    await api.reapplySession(path, id);
    await refresh(path, id);
    await load(path, id);
  };

  return { revertCan: can, loadRevertAvailability: load, undoLatestTurn, revertToMessage, redoLatestTurn };
}
