import type { TimelineEntry } from "@lingzhu/ui/types";

/**
 * Background subagents and shells report back as events rather than as tool
 * rows: started, ran, finished and stopped, counted by kind. Their launch stays
 * a tool card, so its output and child-session link are still reachable.
 */
export type TimelineEventKind = "subagent" | "shell";

export type TimelineEventVerb = "started" | "ran" | "finished" | "stopped";

export interface TimelineEvent {
  verb: TimelineEventVerb;
  kind: TimelineEventKind;
  failed: boolean;
  /** What opening the row lists: a subagent's task or a shell's command. */
  title?: string;
  agent?: string;
  sessionID?: string;
  shellID?: string;
}

/**
 * The outcome a background subagent or shell reports when it finishes. A shell
 * notice carries the job id, a subagent notice the child session id.
 */
export function noticeEvent(entry: TimelineEntry): TimelineEvent | undefined {
  const notice = entry.notice;
  if (!notice || (notice.source !== "subagent" && notice.source !== "shell")) return undefined;
  const item = {
    kind: notice.source as TimelineEventKind,
    title: notice.description,
    sessionID: notice.source === "subagent" ? notice.id : undefined,
    shellID: notice.source === "shell" ? notice.id : undefined,
  };

  if (notice.state === "cancelled") return { ...item, verb: "stopped", failed: false };
  // A command that exited non-zero failed even though the job itself settled.
  const failed = notice.state === "error" || (typeof notice.exit === "number" && notice.exit !== 0);
  return { ...item, verb: "finished", failed };
}

/**
 * A run of events as one label: each verb once, in the order it first happened,
 * with how many of each kind, and how many failed overall. Two finishes in a row
 * read "Finished 2 subagents".
 */
export function summarizeEvents(events: readonly TimelineEvent[]) {
  const verbs: { verb: TimelineEventVerb; kinds: { kind: TimelineEventKind; count: number }[] }[] = [];
  for (const event of events) {
    let bucket = verbs.find((item) => item.verb === event.verb);
    if (!bucket) {
      bucket = { verb: event.verb, kinds: [] };
      verbs.push(bucket);
    }
    const kind = bucket.kinds.find((item) => item.kind === event.kind);
    if (kind) kind.count += 1;
    else bucket.kinds.push({ kind: event.kind, count: 1 });
  }
  return { verbs, failed: events.filter((event) => event.failed).length };
}
