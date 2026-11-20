import { useEffect, useReducer, useRef } from "react";
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
  const [state, dispatch] = useReducer(
    transitionSessionDiff,
    undefined,
    createSessionDiffState,
  );
  const attempt = useRef(0);

  useEffect(() => {
    const id = ++attempt.current;
    dispatch({ type: "load", attempt: id });
    let alive = true;
    api
      .sessionDiff(workspace, sessionID)
      .then((diff) => {
        if (alive) dispatch({ type: "loaded", attempt: id, diff });
      })
      .catch((cause) => {
        if (alive) dispatch({ type: "failed", attempt: id, message: messageOf(cause) });
      });
    return () => {
      alive = false;
    };
  }, [workspace, sessionID]);

  const view = sessionDiffView(state);
  return {
    ...view,
    select: (file?: string) => dispatch({ type: "selected", file }),
  };
}
