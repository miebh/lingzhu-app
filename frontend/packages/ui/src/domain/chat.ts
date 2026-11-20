import type { ChatState, Message, MessageSwitch, TimelineEntry, TurnUsage } from "../types";

export function blankChat(id: string, title = "New session", provider?: string, model?: string, agent?: string): ChatState {
  return {
    id,
    title,
    draft: true,
    provider,
    model,
    agent,
    loading: false,
    entries: [],
    running: false,
    tokens: 0,
    pending: [],
    questions: [],
    inbox: [],
  };
}

/**
 * Rebuilds the transcript from stored messages. Tool arguments live on the
 * assistant message while their rows come from tool results, so the two are
 * paired here; assistant tool calls alone produce no row.
 */
export function entriesFromMessages(messages: Message[]): TimelineEntry[] {
  const argumentsByID = new Map<string, string>();
  for (const message of messages) {
    for (const call of message.toolCalls ?? []) {
      argumentsByID.set(call.id, call.arguments);
    }
  }
  const turns = turnUsageByPrompt(messages);

  const entries: TimelineEntry[] = [];
  messages.forEach((message, index) => {
    const key = `history-${index}`;
    if (message.compaction) {
      entries.push({
        key,
        role: "compaction",
        compaction: {
          status: "completed",
          summary: message.content,
          covered: message.compactionCovered,
          reason: message.compactionReason,
        },
        created: message.created,
      });
      return;
    }
    if (message.shell) {
      entries.push({ key, role: "shell", shell: message.shell, created: message.created });
      return;
    }
    if (message.switch) {
      // A record that names no previous selection, or repeats it, is not a
      // change; older logs stored one for the first prompt of a session, and
      // drawing it would put a "Switched to ..." line above the first message.
      if (!switchChanges(message.switch)) return;
      entries.push({ key, role: "switch", switch: message.switch, created: message.created });
      return;
    }
    if (message.failure) {
      entries.push({ key, role: "failure", failure: message.failure, created: message.created });
      return;
    }
    if (message.role === "user") {
      if (message.synthetic) {
        const source = message.syntheticSource ?? "";
        if (
          source === "shell" ||
          source === "subagent" ||
          source === "schedule" ||
          source === "form" ||
          source === "instructions"
        ) {
          entries.push({
            key,
            role: "notice",
            text: message.syntheticDescription ?? "",
            notice: {
              source,
              state: message.syntheticState,
              description: message.syntheticDescription,
              id: message.syntheticId,
              sources: message.syntheticSources,
            },
            created: message.created,
          });
          return;
        }
        // An instruction load has no source; it becomes the same "Loaded ..."
        // row the live synthetic event produced.
        const paths = message.syntheticPaths ?? [];
        if (paths.length > 0) {
          entries.push({ key, role: "loaded", loaded: paths, created: message.created });
        }
        return;
      }
      entries.push({
        key,
        role: "user",
        text: message.content,
        created: message.created,
        agent: message.agent,
        provider: message.provider,
        model: message.model,
        comments: message.comments,
        voice: message.voice,
        references: message.references?.map((reference) => ({
          mime: reference.mime ?? "",
          name: reference.name,
        })),
        attachments: message.attachments?.map((attachment) => ({
          mime: attachment.mime,
          name: attachment.name,
          data: attachment.data,
          kind: attachment.kind,
          start: attachment.start,
          end: attachment.end,
        })),
        turn: turns.get(index),
      });
      return;
    }
    if (message.role === "assistant") {
      const parts = message.parts?.filter((part) => part.text.trim()) ?? [];
      if (parts.length > 0) {
        parts.forEach((part, partIndex) => {
          if (part.type === "reasoning") {
            entries.push({
              key: `${key}-part-${partIndex}`,
              role: "reasoning",
              text: part.text,
              created: part.created,
              endedAt: part.completed,
            });
          } else {
            entries.push({ key: `${key}-part-${partIndex}`, role: "assistant", text: part.text });
          }
        });
        return;
      }
      if (message.reasoning) {
        entries.push({
          key: `${key}-reasoning`,
          role: "reasoning",
          text: message.reasoning,
          created: message.reasoningCreated,
          endedAt: message.reasoningCompleted,
        });
      }
      if (message.content) entries.push({ key, role: "assistant", text: message.content });
      return;
    }
    entries.push({
      key,
      role: "tool",
      tool: {
        id: message.toolCallId ?? key,
        name: message.name || "tool",
        arguments: argumentsByID.get(message.toolCallId ?? "") ?? "",
        output: message.content,
        diff: message.diff,
        failed: message.failed,
        cancelled: message.cancelled,
        metadata: message.metadata,
        done: true,
      },
    });
  });
  return entries;
}

/** Whether a stored message opens a new turn in the transcript. */
function opensTurn(message: Message): boolean {
  return (
    message.role === "user" &&
    !message.synthetic &&
    !message.compaction &&
    !message.shell &&
    !message.switch &&
    !message.failure
  );
}

function timeValue(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Per-prompt footer measurements keyed by the message index that opened the
 * turn. Throughput follows the reference session-turn rule: every assistant
 * step of the turn must report its streamed boundary, and tool execution or the
 * wait for the first token never enters the divisor. Older history without
 * those fields leaves throughput unset instead of inventing a number.
 */
export function turnUsageByPrompt(messages: Message[]): Map<number, TurnUsage> {
  const turns = new Map<number, TurnUsage>();
  let promptIndex = -1;
  let promptAt: number | undefined;
  let endedAt: number | undefined;
  let output = 0;
  let streamedMs = 0;
  let steps = 0;
  let timedSteps = 0;

  const settle = () => {
    if (promptIndex < 0) return;
    const usage: TurnUsage = {};
    if (promptAt !== undefined && endedAt !== undefined) {
      usage.durationMs = Math.max(0, endedAt - promptAt);
    }
    if (steps > 0 && timedSteps === steps && output > 0 && streamedMs > 0) {
      usage.tokensPerSecond = output / (streamedMs / 1000);
    }
    if (usage.durationMs !== undefined || usage.tokensPerSecond !== undefined) {
      turns.set(promptIndex, usage);
    }
  };

  messages.forEach((message, index) => {
    if (opensTurn(message)) {
      settle();
      promptIndex = index;
      promptAt = timeValue(message.created);
      endedAt = undefined;
      output = 0;
      streamedMs = 0;
      steps = 0;
      timedSteps = 0;
      return;
    }
    if (message.role !== "assistant" || message.failure) return;
    steps += 1;
    output += (message.outputTokens ?? 0) + (message.reasoningTokens ?? 0);
    const streamedAt = timeValue(message.streamed);
    const firstAt = timeValue(message.firstToken ?? message.started);
    if (streamedAt !== undefined && firstAt !== undefined) {
      streamedMs += Math.max(0, streamedAt - firstAt);
      timedSteps += 1;
    }
    // Older steps predate Completed, but their record time already marks when
    // the reply landed, so the turn keeps a duration.
    const completedAt = timeValue(message.completed) ?? timeValue(message.created);
    if (completedAt !== undefined) endedAt = Math.max(endedAt ?? completedAt, completedAt);
  });
  settle();
  return turns;
}

/** chatKey scopes a session to its workspace; IDs are only unique per core. */
export function chatKey(workspace: string, sessionID: string): string {
  return `${workspace}\u0000${sessionID}`;
}

/**
 * Whether a recorded agent or model row names a real change. Adopting the
 * default selection on the first prompt is not one, and a row that names no
 * previous value has nothing to say.
 */
export function switchChanges(value: MessageSwitch): boolean {
  if (value.kind === "agent") {
    return Boolean(value.agent) && Boolean(value.previous) && value.agent !== value.previous;
  }
  const provider = value.provider ?? "";
  const model = value.model ?? "";
  if (!provider && !model) return false;
  const previousProvider = value.previousProvider ?? "";
  const previousModel = value.previousModel ?? "";
  if (!previousProvider && !previousModel) return false;
  return provider !== previousProvider || model !== previousModel;
}
