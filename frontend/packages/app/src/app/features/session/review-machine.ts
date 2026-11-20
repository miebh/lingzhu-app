import type { SessionDiff } from "@lingzhu/ui/types";

/** One load attempt. Results from an older attempt never reach the pane. */
export type SessionDiffState =
  | { status: "loading"; attempt: number }
  | { status: "ready"; attempt: number; diff: SessionDiff; selected?: string }
  | { status: "error"; attempt: number; message: string };

export type SessionDiffEvent =
  | { type: "load"; attempt: number }
  | { type: "loaded"; attempt: number; diff: SessionDiff }
  | { type: "failed"; attempt: number; message: string }
  | { type: "selected"; file?: string };

export function createSessionDiffState(): SessionDiffState {
  return { status: "loading", attempt: 0 };
}

/**
 * The review pane loads a diff per workspace/session. Selecting a file is a
 * separate event so a late response cannot steal the file the reader picked.
 */
export function transitionSessionDiff(state: SessionDiffState, event: SessionDiffEvent): SessionDiffState {
  switch (event.type) {
    case "load":
      if (state.status === "loading" && state.attempt >= event.attempt) return state;
      return { status: "loading", attempt: event.attempt };
    case "loaded":
      if (state.status !== "loading" || state.attempt !== event.attempt) return state;
      return {
        status: "ready",
        attempt: state.attempt,
        diff: event.diff,
        selected: event.diff.diffs[0]?.file,
      };
    case "failed":
      if (state.status !== "loading" || state.attempt !== event.attempt) return state;
      return { status: "error", attempt: state.attempt, message: event.message };
    case "selected":
      if (state.status !== "ready" || state.selected === event.file) return state;
      return { ...state, selected: event.file };
  }
}

export function sessionDiffView(state: SessionDiffState) {
  return {
    diff: state.status === "ready" ? state.diff : undefined,
    selected: state.status === "ready" ? state.selected : undefined,
    loading: state.status === "loading",
    error: state.status === "error" ? state.message : "",
  };
}
