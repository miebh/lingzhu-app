import { createEffect, createMemo, createSignal, type Accessor } from "solid-js";
import { api } from "../lib/api";
import { t } from "@lingzhu/ui/i18n";
import { useChatStore } from "../store/chat";
import { notify } from "../store/notify";

interface Options {
  workspace: Accessor<string | undefined>;
  sessionID: Accessor<string | undefined>;
  /** A completed turn adds checklist rows, so availability reloads with it. */
  entryCount: Accessor<number>;
  restorePrompt: (text: string) => void;
}

/**
 * Revert availability and the three revert actions. A staged revert hides the
 * tail of the conversation and the prompt returns to the composer.
 */
export function useRevert({ workspace, sessionID, entryCount, restorePrompt }: Options) {
  const [can, setCan] = createSignal({ undo: false, redo: false });
  // The shell getters are coarse, so each projection is memoised: the effect
  // below should re-check availability when the session or its message count
  // changes, not on every streamed token.
  const path = createMemo(() => workspace());
  const id = createMemo(() => sessionID());
  const total = createMemo(() => entryCount());

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

  createEffect(() => {
    const currentPath = path();
    const currentId = id();
    total();
    if (!currentPath || !currentId) {
      setCan({ undo: false, redo: false });
      return;
    }
    void load(currentPath, currentId);
  });

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
    await useChatStore.getState().refresh(path, id);
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
    await useChatStore.getState().refresh(path, id);
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
    await useChatStore.getState().refresh(path, id);
    await load(path, id);
  };

  return {
    revertCan: can,
    loadRevertAvailability: load,
    undoLatestTurn,
    revertToMessage,
    redoLatestTurn,
  };
}
