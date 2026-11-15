import type { TimelineEntry } from "@lingzhu/ui/types";

/** What the live status line under a working turn says. */
export type TimelineStatus = "working" | "waitingApproval" | "waitingAnswer" | "waitingShell";

/**
 * The status line says Working unless the turn waits on the user or on a shell
 * command. A permission or a question outranks the call that is running, so the
 * line names what the reader has to do.
 */
export function timelineStatus(input: {
  /** A permission or a question waits on the user. */
  blocked?: "approval" | "answer";
  /** The transcript entries, oldest first. */
  entries: readonly TimelineEntry[];
}): TimelineStatus {
  if (input.blocked === "approval") return "waitingApproval";
  if (input.blocked === "answer") return "waitingAnswer";

  const last = input.entries.length > 0 ? input.entries[input.entries.length - 1] : undefined;
  if (last?.role !== "tool" || !last.tool || last.tool.done) return "working";

  return last.tool.name === "shell" ? "waitingShell" : "working";
}
