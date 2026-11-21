import { entryAttachments } from "@lingzhu/ui/attachments";
import { t } from "@lingzhu/ui/i18n";
import { isCancellation } from "./errors";
import type {
  ChatState,
  CoreEvent,
  InboxItem,
  QuestionPrompt,
  ShellRun,
  TimelineEntry,
  UsageTotals,
} from "@lingzhu/ui/types";
import { switchChanges } from "@lingzhu/ui/domain/chat";

/**
 * Folds one core event into a chat. Kept free of UI rendering so the transcript
 * rules stay testable and the chat provider only owns wiring.
 */
export function applyEvent(chats: Record<string, ChatState>, key: string, event: CoreEvent): Record<string, ChatState> {
  const chat = chats[key];
  if (!chat) return chats;
  const data = event.data ?? {};
  const next: ChatState = { ...chat, loading: false };
  const startedAt = () => {
    // Every event that reaches here belongs to an active turn, so the chat is
    // running even when the local send did not set the flag (a session opened
    // mid-turn) or a refresh landed before the turn registered. Without this,
    // the live status row appears only after the next context fetch.
    next.running = true;
    if (next.runStartedAt === undefined) next.runStartedAt = Date.now();
  };
  let entries = chat.entries;
  // Pending input is one projection shared by the queue strip and the pending
  // transcript rows. Every inbox fact updates this list, and delivery removes
  // the item in the same state update that appends the visible message.
  let inbox = chat.inbox ?? [];
  const dropInput = (id: string) => {
    if (!id) return;
    const remaining = inbox.filter((item) => item.id !== id);
    if (remaining.length !== inbox.length) inbox = remaining;
  };
  const upsertInput = (item: InboxItem) => {
    const index = inbox.findIndex((existing) => existing.id === item.id);
    inbox = index >= 0 ? inbox.map((existing, i) => (i === index ? item : existing)) : [...inbox, item];
  };
  const inboxItem = (
    type: string,
    id: string,
    text: string,
    delivery: string,
    payload?: Record<string, unknown>,
  ): InboxItem => ({
    id,
    sessionID: event.sessionId,
    type,
    delivery,
    payload: { text, data: payload },
    time: { created: event.at ?? new Date().toISOString() },
  });
  // A delivery event names the inbox item it consumed, so the pending row and
  // the transcript row transition together.
  if (typeof data.inputId === "string") dropInput(data.inputId);

  /** Index of the first row that belongs to the current turn. */
  const turnStart = (list: TimelineEntry[]) => findLastIndex(list, (entry) => entry.role === "user") + 1;

  /**
   * Closes the reasoning rows a step left open. They are found by the live flag
   * and scoped to the current turn: an older turn's thought must not be closed
   * (or merged into) by a later step.
   */
  const closeLiveReasoning = (list: TimelineEntry[], at?: string): TimelineEntry[] => {
    const endedAt = at ?? new Date().toISOString();
    const from = turnStart(list);
    return list.map((entry, index) =>
      index >= from && entry.role === "reasoning" && entry.live ? { ...entry, live: false, endedAt } : entry,
    );
  };

  /**
   * Closes every row a turn was still streaming. A step that streamed text or a
   * thought and then ended without a confirming event would otherwise keep a
   * `live` row open, and the next turn's deltas would append into it.
   */
  const settleLive = (list: TimelineEntry[], at?: string): TimelineEntry[] => {
    const endedAt = at ?? new Date().toISOString();
    return list.map((entry) => {
      if (!entry.live) return entry;
      if (entry.role === "reasoning") return { ...entry, live: false, endedAt };
      if (entry.role === "assistant") return { ...entry, live: false };
      return entry;
    });
  };

  switch (event.type) {
    case "input.queued":
    case "synthetic.queued": {
      const id = typeof data.id === "string" ? data.id : "";
      if (!id) break;
      const payload =
        data.payload && typeof data.payload === "object" ? (data.payload as Record<string, unknown>) : undefined;
      upsertInput(
        inboxItem(
          event.type === "synthetic.queued" ? "synthetic" : "user",
          id,
          String(data.text ?? ""),
          typeof data.delivery === "string" && data.delivery ? data.delivery : "steer",
          payload,
        ),
      );
      break;
    }
    case "compaction.queued":
    case "move.queued": {
      const id = typeof data.id === "string" ? data.id : "";
      if (!id) break;
      upsertInput(
        inboxItem(
          event.type === "compaction.queued" ? "compaction" : "move",
          id,
          "",
          typeof data.delivery === "string" && data.delivery ? data.delivery : "steer",
          data as Record<string, unknown>,
        ),
      );
      break;
    }
    case "input.updated": {
      const id = typeof data.id === "string" ? data.id : "";
      const delivery = typeof data.delivery === "string" ? data.delivery : "";
      if (!id || !delivery) break;
      inbox = inbox.map((item) => (item.id === id ? { ...item, delivery } : item));
      break;
    }
    case "input.cancelled":
      dropInput(typeof data.id === "string" ? data.id : "");
      break;
    case "turn.cancelled":
      // A cancelled turn drops every input queued before its claim.
      inbox = [];
      break;
    case "shell.ended": {
      // The composer shows a pending shell row; adopt it when the core echoes
      // the same command, otherwise append a new shell message.
      const shell: ShellRun = {
        command: String(data.command ?? ""),
        output: String(data.output ?? ""),
        exit: Number(data.exit ?? 0),
        timedOut: Boolean(data.timedOut),
        truncated: Boolean(data.truncated),
      };
      const pendingAt = findLastIndex(
        entries,
        (entry) => entry.role === "shell" && entry.shell?.running === true && entry.shell.command === shell.command,
      );
      if (pendingAt >= 0) {
        entries = entries.map((entry, index) =>
          index === pendingAt ? { ...entry, shell, ...(event.at ? { created: event.at } : {}) } : entry,
        );
      } else {
        entries = [...entries, { key: nextEntryKey("shell"), role: "shell", shell, created: event.at }];
      }
      break;
    }
    case "synthetic": {
      const paths = Array.isArray(data.paths)
        ? data.paths.filter((value): value is string => typeof value === "string")
        : [];
      const sources = Array.isArray(data.sources)
        ? data.sources.filter((value): value is string => typeof value === "string")
        : [];
      const source = typeof data.source === "string" ? data.source : "";
      if (paths.length > 0) {
        entries = [...entries, { key: nextEntryKey("loaded"), role: "loaded", loaded: paths, created: event.at }];
      } else if (source) {
        // An instruction update is an informational notice, not finished work;
        // other sourced synthetics read like the work they report on.
        const description = typeof data.description === "string" ? data.description.trim() : "";
        entries = [
          ...entries,
          {
            key: nextEntryKey("notice"),
            role: "notice",
            text: description,
            notice: {
              source,
              state: source === "instructions" ? undefined : "completed",
              description,
              ...(sources.length > 0 ? { sources } : {}),
            },
            created: event.at,
          },
        ];
      } else if (typeof data.description === "string" && data.description.trim()) {
        entries = [...entries, { key: nextEntryKey("notice"), role: "notice", text: data.description.trim(), created: event.at }];
      }
      break;
    }
    case "user.message": {
      // A prompt echoed while the turn was already live arrived as a steer, so
      // it grows into place instead of appearing like a fresh turn. Delivered
      // queue prompts carry their delivery mode and start a normal block.
      const delivery = typeof data.delivery === "string" ? data.delivery : undefined;
      const steer = (delivery ? delivery === "steer" : chat.running === true) || undefined;
      // A prompt echo is the first event of a turn, so it starts the live
      // status even when this client never sent the prompt itself.
      startedAt();
      // The composer already rendered an optimistic row; adopt it instead of
      // stacking a second copy when the core echoes the prompt back.
      const text = String(data.text ?? "");
      const attachments = entryAttachments(data.attachments);
      const references = entryAttachments(data.references);
      const comments = Array.isArray(data.comments)
        ? data.comments.flatMap((value) => {
            if (!value || typeof value !== "object") return [];
            const item = value as { id?: unknown; file?: unknown; line?: unknown; body?: unknown };
            if (typeof item.file !== "string" || typeof item.body !== "string") return [];
            return [
              {
                id: typeof item.id === "string" ? item.id : undefined,
                file: item.file,
                line: typeof item.line === "number" ? item.line : undefined,
                body: item.body,
              },
            ];
          })
        : undefined;
      const voice = data.voice === true;
      const meta = {
        agent: String(data.agent ?? ""),
        provider: String(data.provider ?? ""),
        model: String(data.model ?? ""),
      };
      const steerAt = findLastIndex(entries, (entry) => entry.pending === true && entry.text === text);
      if (steerAt >= 0) {
        entries = entries.map((entry, index) =>
          index === steerAt
            ? {
                ...entry,
                pending: false,
                // The composer marked the row when it sent it into a live turn;
                // the echo confirms it but must not clear that.
                steer: entry.steer ?? steer,
                attachments: attachments ?? entry.attachments,
                references: references ?? entry.references,
                comments: comments ?? entry.comments,
                voice: voice || entry.voice,
                created: event.at ?? entry.created,
                agent: meta.agent || entry.agent,
                provider: meta.provider || entry.provider,
                model: meta.model || entry.model,
              }
            : entry,
        );
      } else {
        entries = [
          ...entries,
          { key: nextEntryKey("user"), role: "user", text, attachments, references, comments, voice, steer, created: event.at, ...meta },
        ];
      }
      break;
    }
    case "run.retry":
      next.retry = {
        attempt: Number(data.attempt ?? 0),
        next: String(data.next ?? ""),
        message: String(data.message ?? ""),
      };
      break;
    case "step.start":
      startedAt();
      next.retry = undefined;
      break;
    case "text.delta": {
      startedAt();
      next.retry = undefined;
      const text = String(data.text ?? "");
      if (!text) break;
      // Only a live reasoning row can be open when text starts; every earlier
      // row keeps its identity. Rewriting the whole list on each delta would
      // copy every entry in a long transcript.
      entries = closeLiveReasoning(entries, event.at);
      // The open row is identified by its live flag, never by its position: a
      // step that already called tools has those rows after the text, and text
      // that resumes after them still belongs to the same step.
      const openAt = findLastIndex(
        entries,
        (entry) => entry.role === "assistant" && entry.live === true,
        turnStart(entries),
      );
      if (openAt >= 0) {
        const open = entries[openAt];
        entries = replaceEntry(entries, openAt, { ...open, text: (open.text ?? "") + text });
      } else {
        entries = [...entries, { key: nextEntryKey("assistant"), role: "assistant", text, live: true }];
      }
      break;
    }
    case "reasoning.delta": {
      startedAt();
      const text = String(data.text ?? "");
      if (!text) break;
      // Same rule as text: the open thought is the live row, wherever the tool
      // rows of this step left it.
      const openAt = findLastIndex(
        entries,
        (entry) => entry.role === "reasoning" && entry.live === true,
        turnStart(entries),
      );
      if (openAt >= 0) {
        const open = entries[openAt];
        entries = replaceEntry(entries, openAt, { ...open, text: (open.text ?? "") + text });
      } else {
        entries = [
          ...entries,
          {
            key: nextEntryKey("reasoning"),
            role: "reasoning",
            text,
            live: true,
            created: event.at ?? new Date().toISOString(),
          },
        ];
      }
      break;
    }
    case "assistant.message": {
      startedAt();
      next.retry = undefined;
      const text = String(data.text ?? "");
      const ended = event.at ?? new Date().toISOString();
      const reasoning = String(data.reasoning ?? "");
      const reasoningCreated = data.reasoningCreated ? String(data.reasoningCreated) : undefined;
      const reasoningCompleted = data.reasoningCompleted ? String(data.reasoningCompleted) : ended;
      // Rows before this turn's prompt are somebody else's reply: a provider that
      // only reports its final reasoning must not merge into an earlier turn's
      // thought just because the text happens to share a prefix.
      const from = turnStart(entries);
      // Live deltas normally built the reasoning row already. When a provider
      // only reports the final reasoning, reconcile it before the text row.
      let reasoningAt = -1;
      if (reasoning) {
        for (let index = entries.length - 1; index >= from; index -= 1) {
          const entry = entries[index];
          if (entry.role !== "reasoning") continue;
          if (entry.live || ((entry.text ?? "") !== "" && reasoning.startsWith(entry.text ?? ""))) {
            reasoningAt = index;
            break;
          }
        }
      }
      if (reasoningAt >= 0) {
        const entry = entries[reasoningAt];
        entries = replaceEntry(entries, reasoningAt, {
          ...entry,
          text: reasoning,
          live: false,
          created: entry.created ?? reasoningCreated,
          endedAt: reasoningCompleted,
        });
      } else if (reasoning) {
        const openText = findLastIndex(
          entries,
          (entry) => entry.role === "assistant" && entry.live === true,
          from,
        );
        let insertAt = openText >= 0 ? openText : entries.length;
        if (openText < 0) {
          // Tool calls from this step already landed; reasoning belongs above
          // them, but never above the prompt that started the turn.
          while (insertAt > from && entries[insertAt - 1].role === "tool") insertAt -= 1;
        }
        const entry: TimelineEntry = {
          key: nextEntryKey("reasoning"),
          role: "reasoning",
          text: reasoning,
          live: false,
          created: reasoningCreated ?? ended,
          endedAt: reasoningCompleted,
        };
        entries = [...entries.slice(0, insertAt), entry, ...entries.slice(insertAt)];
      }
      entries = closeLiveReasoning(entries, reasoningCompleted);
      const meta = {
        agent: String(data.agent ?? ""),
        provider: String(data.provider ?? ""),
        model: String(data.model ?? ""),
      };
      // The streamed row is authoritative until this event confirms it. A step
      // that streamed commentary before calling tools leaves that row above the
      // tool rows, not at the end, so it is found by its live flag instead of
      // its position; otherwise the confirmed reply would be appended a second
      // time and the transcript would show the same paragraph twice.
      const streamedAt = findLastIndex(
        entries,
        (entry) => entry.role === "assistant" && entry.live === true,
        from,
      );
      if (streamedAt >= 0) {
        const streamed = entries[streamedAt];
        entries = replaceEntry(entries, streamedAt, {
          ...streamed,
          // An empty event text means the step produced no text of its own; the
          // row keeps what it already streamed rather than blanking it.
          text: text || (streamed.text ?? ""),
          live: false,
          agent: meta.agent || streamed.agent,
          provider: meta.provider || streamed.provider,
          model: meta.model || streamed.model,
        });
      } else {
        entries = [...entries, { key: nextEntryKey("assistant"), role: "assistant", text, ...meta }];
      }
      break;
    }
    case "tool.call":
      startedAt();
      entries = closeLiveReasoning(entries, event.at);
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
    case "tool.output": {
      const id = String(data.id ?? "");
      const chunk = String(data.output ?? "");
      if (!chunk) break;
      entries = entries.map((entry) =>
        entry.role === "tool" && entry.tool?.id === id && !entry.tool.done
          ? { ...entry, tool: { ...entry.tool, output: `${entry.tool.output ?? ""}${chunk}` } }
          : entry,
      );
      break;
    }
    case "tool.progress": {
      const id = String(data.id ?? "");
      const metadata =
        data.metadata && typeof data.metadata === "object"
          ? (data.metadata as Record<string, unknown>)
          : undefined;
      if (!id || !metadata) break;
      entries = entries.map((entry) =>
        entry.role === "tool" && entry.tool?.id === id && !entry.tool.done
          ? { ...entry, tool: { ...entry.tool, metadata } }
          : entry,
      );
      break;
    }
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
                attachments: entryAttachments(data.attachments),
                metadata:
                  data.metadata && typeof data.metadata === "object"
                    ? (data.metadata as Record<string, unknown>)
                    : undefined,
                failed: Boolean(data.failed),
                cancelled: Boolean(data.cancelled),
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
    case "question.asked": {
      const questions = Array.isArray(data.questions) ? (data.questions as QuestionPrompt[]) : [];
      next.questions = [
        ...chat.questions,
        { id: String(data.id ?? ""), sessionId: event.sessionId, questions },
      ];
      break;
    }
    case "question.replied":
      next.questions = chat.questions.filter((item) => item.id !== String(data.id));
      break;
    case "session.agent.selected": {
      const agent = String(data.agent ?? "");
      if (!agent) break;
      const previous = data.previous ? String(data.previous) : undefined;
      next.agent = agent;
      // A selection that changes nothing draws no divider, and neither does the
      // first one of a session, which has no earlier turn to switch from.
      const change = { kind: "agent" as const, agent, previous };
      if (!switchChanges(change)) break;
      entries = [
        ...entries,
        {
          key: nextEntryKey("switch"),
          role: "switch",
          switch: change,
          created: event.at,
        },
      ];
      break;
    }
    case "session.model.selected": {
      const provider = String(data.provider ?? "");
      const model = String(data.model ?? "");
      if (!provider && !model) break;
      const previous =
        data.previous && typeof data.previous === "object"
          ? (data.previous as { provider?: unknown; model?: unknown })
          : undefined;
      const previousProvider = typeof previous?.provider === "string" ? previous.provider : "";
      const previousModel = typeof previous?.model === "string" ? previous.model : "";
      next.provider = provider || next.provider;
      next.model = model || next.model;
      // Same rule as an agent switch: the first selection of a session adopts
      // the default, and a repeat pick is not a change.
      const change = {
        kind: "model" as const,
        provider,
        model,
        previousProvider: previousProvider || undefined,
        previousModel: previousModel || undefined,
      };
      if (!switchChanges(change)) break;
      entries = [
        ...entries,
        {
          key: nextEntryKey("switch"),
          role: "switch",
          switch: change,
          created: event.at,
        },
      ];
      break;
    }
    case "job.completed": {
      const command = String(data.command ?? "background command");
      const status = String(data.status ?? "completed");
      const exit = Number(data.exit_code ?? 0);
      entries = [
        ...entries,
        {
          key: nextEntryKey("notice"),
          role: "notice",
          text: command,
          notice: {
            source: "shell",
            state: status === "failed" ? "error" : status,
            description: command,
            exit,
            id: String(data.id ?? ""),
          },
          created: event.at,
        },
      ];
      break;
    }
    case "subagent.completed": {
      const description = String(data.description ?? "subagent");
      const status = String(data.status ?? "completed");
      entries = [
        ...entries,
        {
          key: nextEntryKey("notice"),
          role: "notice",
          text: description,
          notice: {
            source: "subagent",
            state: status === "failed" || status === "error" ? "error" : status,
            description,
            id: String(data.id ?? ""),
          },
          created: event.at,
        },
      ];
      break;
    }
    case "usage":
      next.tokens = Number(data.input ?? 0) + Number(data.cacheRead ?? 0);
      next.usage = addUsage(chat.usage, data);
      break;
    case "compaction.start":
      entries = [
        ...entries,
        {
          key: nextEntryKey("compaction"),
          role: "compaction",
          compaction: { status: "running" },
          created: event.at,
        },
      ];
      break;
    case "compaction.failed": {
      const message = String(data.message ?? "compaction failed");
      let running = -1;
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        if (entries[index].role === "compaction" && entries[index].compaction?.status === "running") {
          running = index;
          break;
        }
      }
      const failed: TimelineEntry = {
        key: running >= 0 ? entries[running].key : nextEntryKey("compaction"),
        role: "compaction",
        compaction: { status: "failed", error: message },
        created: event.at,
      };
      entries =
        running >= 0 ? entries.map((entry, index) => (index === running ? failed : entry)) : [...entries, failed];
      break;
    }
    case "compaction": {
      const checkpoint = String(data.checkpoint ?? "");
      const covered = Number(data.covered ?? 0);
      const usage = data.usage && typeof data.usage === "object" ? (data.usage as Record<string, unknown>) : undefined;
      const usageLabel = usage
        ? t("tokenCount", { count: Number(usage.input ?? 0) + Number(usage.output ?? 0) })
        : undefined;
      const reason = typeof data.reason === "string" ? data.reason : undefined;
      let running = -1;
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        if (entries[index].role === "compaction" && entries[index].compaction?.status === "running") {
          running = index;
          break;
        }
      }
      const completed: TimelineEntry = {
        key: running >= 0 ? entries[running].key : nextEntryKey("compaction"),
        role: "compaction",
        compaction: { status: "completed", summary: checkpoint, covered: covered || undefined, usage: usageLabel, reason },
        created: event.at,
      };
      entries =
        running >= 0
          ? entries.map((entry, index) => (index === running ? completed : entry))
          : [...entries, completed];
      next.notice = undefined;
      break;
    }
    case "run.end": {
      const reason = String(data.reason ?? "done");
      next.running = false;
      next.retry = undefined;
      // A pending request belongs to the turn that asked it. Cancelling or
      // failing the turn releases it in the core, so the dock must go too.
      next.pending = [];
      next.questions = [];
      // The checkpoint message already marks the compaction in history; the
      // live separator only belongs to the turn that produced it.
      next.notice = undefined;
      entries = entries.map((entry) =>
        entry.role === "tool" && entry.tool && !entry.tool.done
          ? { ...entry, tool: { ...entry.tool, done: true } }
          : entry,
      );
      // A turn that ends without confirming its streamed rows must still close
      // them, or the next turn's deltas would append into finished text.
      entries = settleLive(entries, event.at);
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
      // The prompt stream closed, which also happens when a stream belonging to
      // the previous turn ends after the next prompt already started. The turn
      // itself ends with run.end, so this event must not clear the flag.
      break;
    case "client.error": {
      next.running = false;
      // The stream died mid-reply, so nothing will confirm the open rows.
      entries = settleLive(entries, event.at);
      if (isCancellation(data.message)) {
        next.lastRunStatus = "stopped";
        break;
      }
      next.lastRunStatus = "failed";
      next.error = String(data.message ?? "stream failed");
      break;
    }
    case "error":
      next.running = false;
      next.retry = undefined;
      entries = settleLive(entries, event.at);
      if (isCancellation(data.message)) {
        next.lastRunStatus = "stopped";
        break;
      }
      next.lastRunStatus = "failed";
      next.error = String(data.message ?? "run failed");
      break;
  }

  next.entries = entries;
  next.inbox = inbox;
  return { ...chats, [key]: next };
}

let entryID = 0;
export function nextEntryKey(prefix: string): string {
  entryID += 1;
  return `${prefix}-${entryID}`;
}

function findLastIndex(entries: TimelineEntry[], match: (entry: TimelineEntry) => boolean, from = 0): number {
  for (let index = entries.length - 1; index >= from; index -= 1) {
    if (match(entries[index])) return index;
  }
  return -1;
}

/**
 * Copies the entry list with one index replaced. A single splice is cheaper
 * than rebuilding the list through `map`, and the untouched entries keep their
 * identity so memoized rows do not re-render.
 */
function replaceEntry(entries: TimelineEntry[], index: number, entry: TimelineEntry): TimelineEntry[] {
  const next = entries.slice();
  next[index] = entry;
  return next;
}

function addUsage(previous: UsageTotals | undefined, data: Record<string, unknown>): UsageTotals {
  return {
    input: (previous?.input ?? 0) + Number(data.input ?? 0),
    output: (previous?.output ?? 0) + Number(data.output ?? 0),
    cacheRead: (previous?.cacheRead ?? 0) + Number(data.cacheRead ?? 0),
    cacheWrite: (previous?.cacheWrite ?? 0) + Number(data.cacheWrite ?? 0),
  };
}
