import type { ChatState } from "@lingzhu/ui/types";

/** Minimal chat state for a transcript render. */
export const chat = (entries: ChatState["entries"]): ChatState =>
  ({
    id: "s1",
    title: "Session",
    workspace: ".",
    entries,
    running: false,
    tokens: 0,    pending: [],
    questions: [],
    loading: false,
    draft: false,
  }) as unknown as ChatState;
