import type { ChatState, MessageSwitch, TimelineCategory, TimelineDetailInput, TimelineEntry, ToolRun } from "@lingzhu/ui/types";
import { timelineDetail } from "./timeline-detail.ts";
import { noticeEvent, type TimelineEvent } from "./events.ts";

/** The transcript groups tools, thoughts, commentary, notices and shell output like the desktop timeline. */
export type ContextPart =
  | { kind: "tool"; tool: ToolRun }
  | { kind: "reasoning"; entry: TimelineEntry }
  | { kind: "shell"; entry: TimelineEntry }
  | { kind: "notice"; entry: TimelineEntry }
  | { kind: "loaded"; entry: TimelineEntry }
  | { kind: "text"; entry: TimelineEntry };

/** Added and removed line counts for one turn's changed files. */
export interface TurnTotals {
  files: number;
  added: number;
  removed: number;
  /** Concatenated unified diff for the turn's file accordions. */
  patch?: string;
}

/**
 * A timed transcript row. Exactly one payload is set: an entry, a standalone
 * tool, a context group, a read or file group, a turn summary, a retry, an
 * error, a divider, or a run of background events.
 */
export interface TimelineRow {
  key: string;
  entry?: TimelineEntry;
  tool?: ToolRun;
  parts?: ContextPart[];
  read?: ToolRun[];
  files?: ToolRun[];
  diff?: TurnTotals;
  retry?: NonNullable<ChatState["retry"]>;
  error?: string;
  divider?: string;
  /** Set when the divider records an agent or model change rather than an interruption. */
  dividerSwitch?: MessageSwitch;
  /** Background subagents and shells read as one counted row, not as tool calls. */
  events?: TimelineEvent[];
}

function toolCategory(name: string): TimelineCategory | undefined {
  if (["shell", "execute", "bash"].includes(name)) return "shell";
  if (["edit", "write", "patch", "apply_patch"].includes(name)) return "edit";
  if (["subagent", "task"].includes(name)) return "subagents";
  return "tools";
}

const IMAGE_PATH = /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i;

function shellFailed(entry: TimelineEntry) {
  const shell = entry.shell;
  if (!shell) return false;
  return shell.timedOut === true || shell.exit !== 0;
}

function groupedRead(tool: ToolRun) {
  if (tool.name !== "read" || tool.failed) return false;
  const loaded = tool.metadata?.loaded;
  if (Array.isArray(loaded) && loaded.length > 0) return false;
  try {
    const args = JSON.parse(tool.arguments || "{}") as { path?: unknown };
    return !(typeof args.path === "string" && IMAGE_PATH.test(args.path));
  } catch {
    return true;
  }
}

// A turn that a decline or an abort cut short leaves one of these results
// behind. It is the durable trace of an interruption, so the transcript can
// split there the way the reference does.
const INTERRUPTED_RESULT = /(permission declined by user|\baborted\b|\binterrupted\b)/i;

function interruptedBy(tool: ToolRun) {
  if (!tool.failed) return false;
  return INTERRUPTED_RESULT.test(tool.output ?? "");
}

function fileChange(tool: ToolRun) {
  return !tool.failed && ["edit", "write", "patch", "apply_patch"].includes(tool.name);
}

/**
 * Fallback text for an agent or model change divider. The transcript replaces
 * it with a localized label; this keeps the pure projection readable on its own.
 */
function switchLabel(value: MessageSwitch): string {
  if (value.kind === "agent") return value.agent ? `Switched to ${value.agent}` : "Agent switched";
  return value.model ? `Switched to ${value.model}` : "Model switched";
}

export interface TimelineOptions {
  /** The active turn is still running, so its summary waits for the end. */
  running?: boolean;
  /** Insert a changed-files summary after every completed turn. */
  showTurnDiffs?: boolean;
  /** The active turn's scheduled retry, rendered as a row inside the turn. */
  retry?: ChatState["retry"];
  /** The active turn's failure, rendered as a row inside the turn. */
  error?: string;
}

/** Text before a turn's last tool call is commentary; the final text is the answer. */
function analyzeTurns(entries: TimelineEntry[], running: boolean, withDiffs: boolean) {
  const turns: { userKey?: string; items: TimelineEntry[] }[] = [];
  for (const entry of entries) {
    if (entry.role === "user") {
      turns.push({ userKey: entry.key, items: [] });
      continue;
    }
    if (turns.length === 0) turns.push({ items: [] });
    turns[turns.length - 1].items.push(entry);
  }

  const commentary = new Set<string>();
  const beforeUser = new Map<string, TurnTotals>();
  let last: TurnTotals | undefined;

  turns.forEach((turn, index) => {
    const settled = index < turns.length - 1 || !running;
    let totals: TurnTotals | undefined;
    if (withDiffs) {
      const files = new Map<string, DiffTally>();
      const patches: string[] = [];
      for (const entry of turn.items) {
        if (!entry.tool?.diff) continue;
        tallyDiff(files, entry.tool.diff);
        patches.push(entry.tool.diff);
      }
      totals = totalsOf(files);
      if (totals && patches.length > 0) totals.patch = patches.join("\n");
    }

    const texts = turn.items.flatMap((entry, order) =>
      entry.role === "assistant" && (entry.text ?? "").trim() ? [{ entry, order }] : [],
    );
    const lastTool = turn.items.reduce((found, entry, order) => (entry.role === "tool" ? order : found), -1);
    let comments = lastTool < 0 ? [] : texts.filter((item) => item.order < lastTool);
    if (settled && comments.length === texts.length && comments.length > 0) comments = comments.slice(0, -1);
    comments.forEach((item) => commentary.add(item.entry.key));

    if (totals && settled && turn.userKey) {
      const next = turns[index + 1]?.userKey;
      if (index < turns.length - 1 && next) beforeUser.set(next, totals);
      else if (index === turns.length - 1) last = totals;
    }
  });

  return { commentary, beforeUser, last };
}

/** A background event follows the detail setting of its own category. */
function eventVisible(event: TimelineEvent, detail: ReturnType<typeof timelineDetail>) {
  return (event.kind === "subagent" ? detail.subagents : detail.shell).placement !== "hidden";
}

/** Notices follow their source category; failures stay visible even when hidden. */
function noticePlacement(entry: TimelineEntry, detail: ReturnType<typeof timelineDetail>) {
  const source = entry.notice?.source;
  const placement = source === "subagent" ? detail.subagents.placement : detail.notices.placement;
  const required =
    entry.notice?.state === "error" ||
    (source === "shell" && entry.notice?.state === "completed" && entry.notice.exit !== undefined && entry.notice.exit !== 0);
  if (placement === "hidden") return required ? "separate" : "hidden";
  // An instruction update changes how the model behaves from here on, so it
  // stays visible as its own row instead of joining a tool group.
  if (source === "shell" || source === "subagent" || source === "instructions") return "separate";
  return placement;
}

/**
 * Tool calls, thoughts, commentary and shell output that arrive back to back
 * share one summary block. Reads and file changes keep their own compact groups
 * even when the category renders separately, matching the desktop timeline.
 */
export function timelineRows(
  entries: TimelineEntry[],
  detailValue?: TimelineDetailInput,
  options: TimelineOptions = {},
): TimelineRow[] {
  const detail = timelineDetail(detailValue);
  const turns = analyzeTurns(entries, options.running ?? false, options.showTurnDiffs === true);
  const rows: TimelineRow[] = [];
  let parts: ContextPart[] = [];
  // The group keeps the key it started with while parts append. Recomputing it
  // from the parts would remount the block, dropping its expanded state, every
  // time commentary or a thought joins ahead of its first tool.
  let partsKey = "";
  let firstPartKey = "";
  let reads: ToolRun[] = [];
  let files: ToolRun[] = [];
  // Background work accumulates until something else interrupts it, so
  // consecutive launches and their reports read as one counted row.
  let events: TimelineEvent[] = [];

  const addPart = (part: ContextPart) => {
    flushEvents();
    const key = part.kind === "tool" ? part.tool.id : part.entry.key;
    if (!firstPartKey) firstPartKey = key;
    // Commentary can leave a group once its turn settles and it becomes the
    // answer, so it never anchors the key. The next part that stays does.
    if (!partsKey && part.kind !== "text") partsKey = key;
    parts.push(part);
  };

  const flushContext = () => {
    if (parts.length === 0) return;
    rows.push({ key: `context:${partsKey || firstPartKey}`, parts });
    parts = [];
    partsKey = "";
    firstPartKey = "";
  };

  const flushReads = () => {
    if (reads.length === 0) return;
    rows.push({ key: `read:${reads[0].id}`, read: reads });
    reads = [];
  };

  const flushFiles = () => {
    if (files.length === 0) return;
    rows.push({ key: `files:${files[0].id}`, files });
    files = [];
  };

  const flushEvents = () => {
    if (events.length === 0) return;
    rows.push({ key: `events:${events[0].sessionID ?? events[0].shellID ?? "work"}`, events });
    events = [];
  };

  const flush = () => {
    flushContext();
    flushReads();
    flushFiles();
    flushEvents();
  };

  const addEvent = (event: TimelineEvent) => {
    // Nothing else may sit between two events in one row, or the order of what
    // happened would stop being true.
    flushContext();
    flushReads();
    flushFiles();
    events.push(event);
  };

  const pushDiff = (key: string, totals: TurnTotals) => {
    flush();
    rows.push({ key: `diff:${key}`, diff: totals });
  };

  // Set when a turn's tool result shows the turn was cut short. The divider is
  // emitted only if the transcript continues afterwards, so a trailing
  // interruption stays with the run footer instead of doubling the message.
  let pendingInterrupt = false;
  const pushInterrupt = (key: string) => {
    if (!pendingInterrupt) return;
    pendingInterrupt = false;
    flush();
    rows.push({ key: `divider:${key}`, divider: "Interrupted" });
  };

  for (const entry of entries) {
    if (entry.role === "user") {
      const previous = options.showTurnDiffs ? turns.beforeUser.get(entry.key) : undefined;
      if (previous) pushDiff(entry.key, previous);
      pushInterrupt(entry.key);
      flush();
      rows.push({ key: entry.key, entry });
      continue;
    }

    if (entry.role === "tool" && entry.tool) {
      const tool = entry.tool;
      if (interruptedBy(tool)) pendingInterrupt = true;
      if (tool.name === "question" && !tool.done) continue;

      // A finished question keeps its own card; a failed one follows its
      // category like any other tool, as the reference does.
      if (tool.name === "question" && !tool.failed) {
        flush();
        rows.push({ key: entry.key, tool });
        continue;
      }

      const category = toolCategory(tool.name);
      if (!category) continue;

      const placement = detail[category].placement;
      if (placement === "hidden") {
        // A failed call stays visible even when its category is hidden.
        if (!tool.failed) continue;
        flush();
        rows.push({ key: entry.key, tool });
        continue;
      }
      // A grouped category keeps every call, including a failed one, inside the
      // summary block, so one failure never splits the block in two.
      if (placement === "grouped") {
        flushReads();
        flushFiles();
        addPart({ kind: "tool", tool });
        continue;
      }
      if (groupedRead(tool)) {
        flushContext();
        flushFiles();
        flushEvents();
        reads.push(tool);
        continue;
      }
      if (tool.failed) {
        flush();
        rows.push({ key: entry.key, tool });
        continue;
      }
      if (fileChange(tool)) {
        flushContext();
        flushReads();
        flushEvents();
        files.push(tool);
        continue;
      }
      flush();
      rows.push({ key: entry.key, tool });
      continue;
    }

    if (entry.role === "switch" && entry.switch) {
      // An agent or model change ends whatever ran before it and starts a
      // divider, the way the reference draws the two as the same separator.
      flush();
      rows.push({ key: `divider:${entry.key}`, divider: switchLabel(entry.switch), dividerSwitch: entry.switch });
      continue;
    }

    if (entry.role === "failure" && entry.failure) {
      // A recorded failure closes the turn it ended, the same row a live error
      // event draws, so reconnecting or restarting keeps the explanation.
      flush();
      rows.push({ key: entry.key, error: entry.failure.message });
      continue;
    }

    if (entry.role === "loaded") {
      // Instruction loads read as a notice, so they follow the notice placement
      // and join the summary block instead of cutting it in two.
      const placement = detail.notices.placement;
      if (placement === "hidden") continue;
      if (placement === "grouped") {
        flushReads();
        flushFiles();
        flushEvents();
        addPart({ kind: "loaded", entry });
        continue;
      }
      flush();
      rows.push({ key: entry.key, entry });
      continue;
    }

    if (entry.role === "reasoning") {
      if (!(entry.text ?? "").trim()) continue;
      const placement = detail.thinking.placement;
      if (placement === "hidden") continue;
      if (placement === "grouped") {
        flushReads();
        flushFiles();
        flushEvents();
        addPart({ kind: "reasoning", entry });
        continue;
      }
      flush();
      rows.push({ key: entry.key, entry });
      continue;
    }

    if (entry.role === "notice") {
      // A background subagent or shell reporting back folds into one events
      // row, so two finishes in a row read "Finished 2 subagents". The launch
      // itself stays a tool card, where its output and session link live.
      const event = noticeEvent(entry);
      if (event && eventVisible(event, detail)) {
        addEvent(event);
        continue;
      }      // A failed report the category hides still stays visible on its own.
      const placement = noticePlacement(entry, detail);
      if (placement === "hidden") continue;
      if (placement === "grouped") {
        flushReads();
        flushFiles();
        addPart({ kind: "notice", entry });
        continue;
      }
      flush();
      rows.push({ key: entry.key, entry });
      continue;
    }

    if (entry.role === "shell") {
      const placement = detail.shell.placement;
      if (placement === "hidden" && !shellFailed(entry)) continue;
      if (placement === "grouped") {
        flushReads();
        flushFiles();
        addPart({ kind: "shell", entry });
        continue;
      }
      flush();
      rows.push({ key: entry.key, entry });
      continue;
    }

    if (entry.role === "assistant" && turns.commentary.has(entry.key)) {
      const placement = detail.commentary.placement;
      if (placement === "hidden") continue;
      if (placement === "grouped") {
        flushReads();
        flushFiles();
        addPart({ kind: "text", entry });
        continue;
      }
    }

    // A step that produced only reasoning or tool calls still records an empty
    // assistant message. It renders nothing, so it must not split the summary
    // block that spans its step.
    if (entry.role === "assistant" && !(entry.text ?? "").trim()) continue;

    flush();
    rows.push({ key: entry.key, entry });
  }

  flush();
  if (options.showTurnDiffs && turns.last) rows.push({ key: "diff:last", diff: turns.last });
  if (options.retry) rows.push({ key: "retry", retry: options.retry });
  if (options.error) rows.push({ key: "error", error: options.error });
  return uniqueRowKeys(rows);
}

/**
 * Makes every row key unique. A row's natural key can repeat: an events row
 * falls back to a constant when its notices carry no session or shell id, and
 * two runs of background work then share one key. React reuses the DOM for a
 * repeated key, which stacks the second row on top of the first and overlaps
 * the text around it.
 */
function uniqueRowKeys(rows: TimelineRow[]): TimelineRow[] {
  const seen = new Map<string, number>();
  for (const row of rows) {
    const count = seen.get(row.key) ?? 0;
    seen.set(row.key, count + 1);
    if (count > 0) row.key = `${row.key}#${count}`;
  }
  return rows;
}

export function sessionChanges(entries: { tool?: { diff?: string } }[]) {
  const files = new Map<string, DiffTally>();
  for (const entry of entries) {
    const diff = entry.tool?.diff;
    if (diff) tallyDiff(files, diff);
  }
  return totalsOf(files);
}

/** Totals for one turn's diffs, used by the message navigator's change bars. */
export function diffTotals(diffs: (string | undefined)[]) {
  const files = new Map<string, DiffTally>();
  for (const diff of diffs) {
    if (diff) tallyDiff(files, diff);
  }
  return totalsOf(files);
}

interface DiffTally {
  added: number;
  removed: number;
}

/** Adds one unified diff to a per-file line tally. */
function tallyDiff(files: Map<string, DiffTally>, diff: string) {
  let current: DiffTally | undefined;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) {
      const path = line.slice(4).replace(/^b\//, "").trim();
      current = files.get(path) ?? { added: 0, removed: 0 };
      files.set(path, current);
      continue;
    }
    if (!current || line.startsWith("--- ")) continue;
    if (line.startsWith("+")) current.added += 1;
    else if (line.startsWith("-")) current.removed += 1;
  }
}

function totalsOf(files: Map<string, DiffTally>) {
  if (files.size === 0) return undefined;
  let added = 0;
  let removed = 0;
  for (const file of files.values()) {
    added += file.added;
    removed += file.removed;
  }
  return { files: files.size, added, removed };
}
