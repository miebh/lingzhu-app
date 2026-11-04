import type { ChatState, CoreEvent, TimelineEntry, UsageTotals } from "./types";

/**
 * Folds one core event into a chat. Kept free of React so the transcript rules
 * stay testable and the chat provider only owns wiring.
 */
export function applyEvent(chats: Record<string, ChatState>, key: string, event: CoreEvent): Record<string, ChatState> {
  const chat = chats[key];
  if (!chat) return chats;
  const data = event.data ?? {};
  const next: ChatState = { ...chat, loading: false };
  const startedAt = () => {
    if (next.runStartedAt === undefined) next.runStartedAt = Date.now();
  };
  let entries = chat.entries;

  switch (event.type) {
    case "user.message": {
      // The composer already rendered an optimistic row; adopt it instead of
      // stacking a second copy when the core echoes the prompt back.
      const text = String(data.text ?? "");
      const pendingAt = findLastIndex(entries, (entry) => entry.pending === true && entry.text === text);
      if (pendingAt >= 0) {
        entries = entries.map((entry, index) => (index === pendingAt ? { ...entry, pending: false } : entry));
      } else {
        entries = [...entries, { key: nextEntryKey("user"), role: "user", text }];
      }
      break;
    }
    case "step.start":
      startedAt();
      break;
    case "text.delta": {
      startedAt();
      const text = String(data.text ?? "");
      if (!text) break;
      const last = entries[entries.length - 1];
      if (last?.role === "assistant" && last.live) {
        entries = [...entries.slice(0, -1), { ...last, text: (last.text ?? "") + text }];
      } else {
        entries = [...entries, { key: nextEntryKey("assistant"), role: "assistant", text, live: true }];
      }
      break;
    }
    case "assistant.message": {
      startedAt();
      const text = String(data.text ?? "");
      const last = entries[entries.length - 1];
      // The streamed row is authoritative until this event confirms it.
      if (last?.role === "assistant" && last.live) {
        entries = [...entries.slice(0, -1), { ...last, text, live: false }];
      } else {
        entries = [...entries, { key: nextEntryKey("assistant"), role: "assistant", text }];
      }
      break;
    }
    case "tool.call":
      startedAt();
      entries = [
        ...entries,
        {
          key: nextEntryKey("tool"),
          role: "tool",
          tool: {
            id: String(data.id ?? ""),
            name: String(data.name ?? "tool"),
            arguments: String(data.arguments ?? ""),
            done: false,
          },
        },
      ];
      break;
    case "tool.result": {
      const id = String(data.id ?? "");
      entries = entries.map((entry) =>
        entry.role === "tool" && entry.tool?.id === id && !entry.tool.done
          ? {
              ...entry,
              tool: {
                ...entry.tool,
                output: String(data.output ?? ""),
                diff: data.diff ? String(data.diff) : undefined,
                failed: Boolean(data.failed),
                done: true,
              },
            }
          : entry,
      );
      break;
    }
    case "permission.asked":
      next.pending = [
        ...chat.pending,
        {
          id: String(data.id ?? ""),
          sessionId: event.sessionId,
          action: String(data.action ?? ""),
          resources: Array.isArray(data.resources) ? (data.resources as string[]) : [],
          message: data.message ? String(data.message) : undefined,
        },
      ];
      break;
    case "permission.replied":
      next.pending = chat.pending.filter((item) => item.id !== String(data.id));
      break;
    case "usage":
      next.tokens = Number(data.input ?? 0) + Number(data.cacheRead ?? 0);
      next.usage = addUsage(chat.usage, data);
      break;
    case "compaction":
      next.notice = "Context compacted";
      break;
    case "run.end": {
      const reason = String(data.reason ?? "done");
      next.running = false;
      // The checkpoint message already marks the compaction in history; the
      // live separator only belongs to the turn that produced it.
      next.notice = undefined;
      entries = entries.map((entry) =>
        entry.role === "tool" && entry.tool && !entry.tool.done
          ? { ...entry, tool: { ...entry.tool, done: true } }
          : entry,
      );
      next.lastRunStatus =
        reason === "done"
          ? "completed"
          : reason === "interrupted"
            ? "stopped"
            : reason === "max_steps"
              ? "max-steps"
              : "failed";
      next.lastRunMs = chat.runStartedAt === undefined ? undefined : Date.now() - chat.runStartedAt;
      next.runEndedAt = Date.now();
      next.runStartedAt = undefined;
      break;
    }
    case "client.done":
      next.running = false;
      break;
    case "client.error":
      next.running = false;
      next.lastRunStatus = "failed";
      next.error = String(data.message ?? "stream failed");
      break;
    case "error":
      next.running = false;
      next.lastRunStatus = "failed";
      next.error = String(data.message ?? "run failed");
      break;
  }

  next.entries = entries;
  return { ...chats, [key]: next };
}

let entryID = 0;
export function nextEntryKey(prefix: string): string {
  entryID += 1;
  return `${prefix}-${entryID}`;
}

function findLastIndex(entries: TimelineEntry[], match: (entry: TimelineEntry) => boolean): number {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (match(entries[index])) return index;
  }
  return -1;
}

function addUsage(previous: UsageTotals | undefined, data: Record<string, unknown>): UsageTotals {
  return {
    input: (previous?.input ?? 0) + Number(data.input ?? 0),
    output: (previous?.output ?? 0) + Number(data.output ?? 0),
    cacheRead: (previous?.cacheRead ?? 0) + Number(data.cacheRead ?? 0),
    cacheWrite: (previous?.cacheWrite ?? 0) + Number(data.cacheWrite ?? 0),
  };
}
