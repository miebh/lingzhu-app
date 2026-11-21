import { createEffect, createMemo, onCleanup } from "solid-js";
import { createReducer } from "@lingzhu/ui/solid";
import { api } from "../../../lib/api";
import { messageOf } from "../../../lib/errors";
import {
  createSessionDiffState,
  sessionDiffView,
  transitionSessionDiff,
} from "./review-machine";

/**
 * Loads the review diff for a session. Each workspace/session change starts a
 * new attempt, so a slow response from the previous session is ignored.
 */
export function useSessionDiff(workspace: string, sessionID: string) {
  const [state, dispatch] = createReducer(transitionSessionDiff, createSessionDiffState);
  let attempt = 0;

  createEffect(() => {
    const path = workspace;
    const id = sessionID;
    const current = ++attempt;
    dispatch({ type: "load", attempt: current });
    let alive = true;
    onCleanup(() => {
      alive = false;
    });
    api
      .sessionDiff(path, id)
      .then((diff) => {
        if (alive) dispatch({ type: "loaded", attempt: current, diff });
      })
      .catch((cause) => {
        if (alive) dispatch({ type: "failed", attempt: current, message: messageOf(cause) });
      });
  });

  const view = createMemo(() => sessionDiffView(state()));
  return {
    get diff() {
      return view().diff;
    },
    get selected() {
      return view().selected;
    },
    get loading() {
      return view().loading;
    },
    get error() {
      return view().error;
    },
    select: (file?: string) => dispatch({ type: "selected", file }),
  };
}
