import { describe, expect, test } from "vitest";
import { timelineRows } from "@lingzhu/session-ui/timeline";
import { timelinePresets } from "@lingzhu/session-ui/timeline-detail";
import { applyEvent } from "@/lib/chat-events";
import { entriesFromMessages } from "@lingzhu/ui/domain/chat";
import { type ChatState, type CoreEvent, type Message, type TimelineEntry, type ToolRun } from "@lingzhu/ui/types";

function tool(id: string, name: string, extra: Partial<ToolRun> = {}): TimelineEntry {
  return {
    key: `t-${id}`,
    role: "tool",
    tool: { id, name, arguments: "{}", done: true, ...extra },
  };
}

function reasoning(key: string, live = false): TimelineEntry {
  return { key, role: "reasoning", text: "thinking", live };
}

function notice(key: string, state = "completed"): TimelineEntry {
  return {
    key,
    role: "notice",
    text: "background job",
    notice: { source: "form", state, description: "background job" },
  };
}

function user(key: string): TimelineEntry {
  return { key, role: "user", text: "prompt" };
}

function edit(key: string, path: string): TimelineEntry {
  return tool(key, "edit", {
    arguments: JSON.stringify({ path }),
    diff: `--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n-old\n+new`,
  });
}

describe("timelineRows", () => {
  test("compact folds reasoning, reads, tools, edits and shell into one group", () => {
    const rows = timelineRows(
      [
        reasoning("r1"),
        tool("1", "read", { arguments: '{"path":"a.ts"}' }),
        tool("2", "grep"),
        tool("3", "shell", { arguments: '{"command":"echo hi"}' }),
        tool("4", "edit", { arguments: '{"path":"a.ts"}' }),
      ],
      "compact",
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].parts).toHaveLength(5);
  });

  test("everything separates thoughts and keeps reads and edits in their own groups", () => {
    const rows = timelineRows(
      [
        reasoning("r1"),
        tool("1", "read", { arguments: '{"path":"a.ts"}' }),
        tool("2", "read", { arguments: '{"path":"b.ts"}' }),
        tool("3", "edit", { arguments: '{"path":"a.ts"}' }),
        tool("4", "shell", { arguments: '{"command":"echo hi"}' }),
      ],
      "everything",
    );

    expect(rows.map((row) => (row.parts ? "context" : row.read ? "read" : row.files ? "files" : row.tool ? "tool" : "entry"))).toEqual([
      "entry",
      "read",
      "files",
      "tool",
    ]);
    expect(rows[1].read).toHaveLength(2);
  });

  test("detailed separates edits and shell but groups thoughts with tools", () => {
    const detailed = timelinePresets.find((preset) => preset.id === "detailed")!.value;
    const rows = timelineRows(
      [
        reasoning("r1"),
        tool("1", "read", { arguments: '{"path":"a.ts"}' }),
        tool("2", "edit", { arguments: '{"path":"a.ts"}' }),
        tool("3", "shell", { arguments: '{"command":"echo hi"}' }),
      ],
      detailed,
    );

    expect(rows[0].parts).toHaveLength(2);
    expect(rows[1].files).toHaveLength(1);
    expect(rows[2].tool?.name).toBe("shell");
  });

  test("text-only hides every tool category", () => {
    const rows = timelineRows(
      [
        reasoning("r1"),
        tool("1", "read", { arguments: '{"path":"a.ts"}' }),
        tool("2", "shell", { arguments: '{"command":"echo hi"}' }),
      ],
      "text-only",
    );

    expect(rows).toHaveLength(0);
  });

  test("image reads stay out of the comma read group", () => {
    const rows = timelineRows(
      [
        tool("1", "read", { arguments: '{"path":"a.ts"}' }),
        tool("2", "read", { arguments: '{"path":"pixel.png"}' }),
      ],
      "everything",
    );

    expect(rows[0].read).toHaveLength(1);
    expect(rows[1].tool?.name).toBe("read");
  });

  test("compact folds notices into the context group", () => {
    const rows = timelineRows([tool("1", "grep"), notice("n1")], "compact");

    expect(rows).toHaveLength(1);
    expect(rows[0].parts?.map((part) => part.kind)).toEqual(["tool", "notice"]);
  });

  test("instruction updates follow the notices placement", () => {
    const instruction: TimelineEntry = {
      key: "i1",
      role: "notice",
      text: "Instructions updated",
      notice: { source: "instructions", description: "Instructions updated", sources: ["agents"] },
    };

    // Compact groups the informational update with the surrounding calls
    // instead of splitting them with a standalone completion row.
    const compact = timelineRows([tool("1", "grep"), instruction, tool("2", "grep")], "compact");
    expect(compact).toHaveLength(1);
    expect(compact[0].parts?.map((part) => part.kind)).toEqual(["tool", "notice", "tool"]);

    // Quiet hides notices, so the update disappears with them.
    const quiet = timelineRows([tool("1", "grep"), instruction], "quiet");
    expect(quiet.some((row) => row.parts?.some((part) => part.kind === "notice"))).toBe(false);
  });

  test("an empty assistant step does not split the group", () => {
    const rows = timelineRows(
      [
        tool("1", "grep"),
        { key: "a1", role: "assistant", text: "" },
        tool("2", "read"),
      ],
      "compact",
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].parts?.map((part) => part.kind)).toEqual(["tool", "tool"]);
  });

  test("compact keeps a failed tool inside the group instead of splitting it", () => {
    const failed = tool("2", "grep", { failed: true, output: "boom" });
    const rows = timelineRows([tool("1", "grep"), failed, tool("3", "read")], "compact");

    expect(rows).toHaveLength(1);
    expect(rows[0].parts?.map((part) => part.kind)).toEqual(["tool", "tool", "tool"]);
    expect(rows[0].parts?.[1].kind === "tool" && rows[0].parts[1].tool.failed).toBe(true);
  });

  test("a separate failure still gets its own row", () => {
    const rows = timelineRows([tool("1", "grep"), tool("2", "grep", { failed: true })], "everything");

    expect(rows.map((row) => (row.tool ? `tool:${row.tool.failed ? "failed" : "ok"}` : "other"))).toEqual([
      "tool:ok",
      "tool:failed",
    ]);
  });

  test("instruction loads follow the notice placement", () => {
    const loaded: TimelineEntry = { key: "l1", role: "loaded", loaded: ["AGENTS.md"] };
    const entries = [tool("1", "grep"), loaded, tool("2", "grep")];
    const compact = timelinePresets.find((preset) => preset.id === "compact")!.value;
    const shape = (rows: ReturnType<typeof timelineRows>) =>
      rows.map((row) =>
        row.parts
          ? `context[${row.parts.map((part) => (part.kind === "tool" ? `tool:${part.tool.id}` : part.kind)).join(",")}]`
          : row.tool
            ? `tool:${row.tool.id}`
            : (row.entry?.role ?? "other"),
      );

    // Grouped, the load joins the summary block instead of splitting it in two.
    expect(shape(timelineRows(entries, compact))).toEqual(["context[tool:1,loaded,tool:2]"]);

    const hidden = timelineRows(entries, { ...compact, notices: { placement: "hidden" } });
    expect(shape(hidden)).toEqual(["context[tool:1,tool:2]"]);
  });

  test("a failed shell notice keeps its own row", () => {
    const entries: TimelineEntry[] = [
      tool("1", "grep"),
      {
        key: "n1",
        role: "notice",
        text: "npm test",
        notice: { source: "shell", state: "completed", description: "npm test", exit: 1 },
      },
      tool("2", "grep"),
    ];

    // Background work reports its outcome as its own row, so the tool block
    // after it starts a new one rather than folding the report into a group.
    const rows = timelineRows(entries, "compact");
    expect(rows.map((row) => (row.parts ? "context" : (row.entry?.role ?? "other")))).toEqual([
      "context",
      "notice",
      "context",
    ]);
  });

  test("a context group keeps its key while parts append", () => {
    const start = timelineRows([tool("1", "grep")], "compact");
    const grown = timelineRows(
      [tool("1", "grep"), { key: "c1", role: "assistant", text: "note" }, tool("2", "read")],
      { ...timelinePresets.find((preset) => preset.id === "compact")!.value, commentary: { placement: "grouped" } },
    );

    expect(start[0].key).toBe(grown[0].key);
  });

  test("live streaming and rebuilt history group a run the same way", () => {
    const events = [
      { workspace: ".", sessionId: "s1", seq: 1, type: "user.message", data: { text: "go" } },
      { workspace: ".", sessionId: "s1", seq: 2, type: "assistant.message", data: { text: "", reasoning: "thought" } },
      { workspace: ".", sessionId: "s1", seq: 3, type: "tool.call", data: { id: "a", name: "grep", arguments: "{}" } },
      { workspace: ".", sessionId: "s1", seq: 4, type: "tool.result", data: { id: "a", output: "hit" } },
      {
        workspace: ".",
        sessionId: "s1",
        seq: 5,
        type: "tool.call",
        data: { id: "b", name: "read", arguments: '{"path":"AGENTS.md"}' },
      },
      {
        workspace: ".",
        sessionId: "s1",
        seq: 6,
        type: "tool.result",
        data: { id: "b", output: "instructions", metadata: { loaded: ["AGENTS.md"] } },
      },
      {
        workspace: ".",
        sessionId: "s1",
        seq: 7,
        type: "synthetic",
        data: { text: "Instructions from: AGENTS.md", description: "Loaded AGENTS.md", paths: ["AGENTS.md"] },
      },
      { workspace: ".", sessionId: "s1", seq: 8, type: "tool.call", data: { id: "c", name: "shell", arguments: "{}" } },
      { workspace: ".", sessionId: "s1", seq: 9, type: "tool.result", data: { id: "c", output: "boom", failed: true } },
      { workspace: ".", sessionId: "s1", seq: 10, type: "assistant.message", data: { text: "Done." } },
    ] as unknown as CoreEvent[];

    let chats: Record<string, ChatState> = {
      s1: {
        id: "s1",
        title: "S",
        draft: false,
        entries: [],
        running: true,
        tokens: 0,        pending: [],
        questions: [],
      } as unknown as ChatState,
    };
    events.forEach((event) => {
      chats = applyEvent(chats, "s1", event);
    });

    const stored: Message[] = [
      { role: "user", content: "go" },
      {
        role: "assistant",
        content: "",
        reasoning: "thought",
        toolCalls: [
          { id: "a", name: "grep", arguments: "{}" },
          { id: "b", name: "read", arguments: '{"path":"AGENTS.md"}' },
        ],
      },
      { role: "tool", content: "hit", toolCallId: "a", name: "grep" },
      { role: "tool", content: "instructions", toolCallId: "b", name: "read", metadata: { loaded: ["AGENTS.md"] } },
      {
        role: "user",
        content: "Instructions from: AGENTS.md",
        synthetic: true,
        syntheticDescription: "Loaded AGENTS.md",
        syntheticPaths: ["AGENTS.md"],
      },
      { role: "assistant", content: "", toolCalls: [{ id: "c", name: "shell", arguments: "{}" }] },
      { role: "tool", content: "boom", toolCallId: "c", name: "shell", failed: true },
      { role: "assistant", content: "Done." },
    ];

    const shape = (rows: ReturnType<typeof timelineRows>) =>
      rows.map((row) =>
        row.parts
          ? `context[${row.parts.map((part) => (part.kind === "tool" ? part.tool.name : part.kind)).join(",")}]`
          : row.entry?.role === "assistant"
            ? `assistant:${row.entry.text}`
            : (row.entry?.role ?? "other"),
      );

    const live = shape(timelineRows(chats["s1"].entries, "compact", { running: false }));
    const history = shape(timelineRows(entriesFromMessages(stored), "compact", { running: false }));

    expect(live).toEqual(history);
    expect(live).toEqual(["user", "context[reasoning,grep,read,loaded,shell]", "assistant:Done."]);
  });

  test("quiet hides notices but keeps failed ones visible", () => {
    const rows = timelineRows(
      [
        notice("n1"),
        notice("n2", "error"),
        {
          key: "n3",
          role: "notice",
          text: "npm test",
          notice: { source: "shell", state: "completed", description: "npm test", exit: 1 },
        },
      ],
      "quiet",
    );

    expect(rows.map((row) => row.entry?.key)).toEqual(["n2", "n3"]);
  });

  test("grouped commentary joins the tool group and hidden commentary disappears", () => {
    const compact = timelinePresets.find((preset) => preset.id === "compact")!.value;
    const entries = [
      user("u1"),
      { key: "c1", role: "assistant" as const, text: "I will inspect the file." },
      tool("1", "read", { arguments: '{"path":"a.ts"}' }),
      { key: "a1", role: "assistant" as const, text: "The file is fine." },
    ];

    const grouped = timelineRows(entries, { ...compact, commentary: { placement: "grouped" } });
    expect(grouped[1].parts?.map((part) => part.kind)).toEqual(["text", "tool"]);
    expect(grouped[2].entry?.text).toBe("The file is fine.");

    const hidden = timelineRows(entries, { ...compact, commentary: { placement: "hidden" } });
    expect(hidden.some((row) => row.entry?.text === "I will inspect the file.")).toBe(false);
    expect(hidden.some((row) => row.entry?.text === "The file is fine.")).toBe(true);
  });

  test("a prompt that joins a live turn is marked as a steer", () => {
    const base: ChatState = {
      id: "s1",
      title: "S",
      draft: false,
      entries: [],
      running: false,
      tokens: 0,      pending: [],
      questions: [],
    };
    const running = { ...base, running: true, runStartedAt: Date.now() };
    const after = applyEvent({ s1: running }, "s1", {
      type: "user.message",
      sessionId: "s1",
      workspace: ".",
      seq: 1,
      at: "2026-01-01T00:00:01Z",
      data: { text: "also check the tests" },
    } as unknown as CoreEvent);
    const entry = after.s1.entries.find((item) => item.text === "also check the tests");
    expect(entry?.steer).toBe(true);

    // The first prompt of a turn is not a steer.
    const fresh = applyEvent({ s1: base }, "s1", {
      type: "user.message",
      sessionId: "s1",
      workspace: ".",
      seq: 2,
      at: "2026-01-01T00:00:02Z",
      data: { text: "start" },
    } as unknown as CoreEvent);
    expect(fresh.s1.entries.find((item) => item.text === "start")?.steer).toBeUndefined();
  });

  test("an agent or model switch draws its own divider", () => {
    const rows = timelineRows(
      [
        user("u1"),
        tool("1", "grep"),
        { key: "sw1", role: "switch", switch: { kind: "agent", agent: "plan", previous: "build" } },
        tool("2", "grep"),
        { key: "sw2", role: "switch", switch: { kind: "model", provider: "openai", model: "gpt-5" } },
        user("u2"),
      ],
      "compact",
    );

    const dividers = rows.filter((row) => row.divider);
    expect(dividers).toHaveLength(2);
    expect(dividers[0].dividerSwitch?.kind).toBe("agent");
    expect(dividers[1].dividerSwitch?.kind).toBe("model");
    // A switch ends the group before it, so the next call starts a new one.
    expect(rows.map((row) => (row.parts ? "context" : row.divider ? "divider" : (row.entry?.role ?? "other")))).toEqual([
      "user",
      "context",
      "divider",
      "context",
      "divider",
      "user",
    ]);
  });

  test("background reports keep one row each", () => {
    const shellNotice = (key: string, state: string): TimelineEntry => ({
      key,
      role: "notice",
      text: "npm test",
      notice: { source: "shell", state, description: "npm test" },
    });
    const rows = timelineRows(
      [
        user("u1"),
        tool("1", "grep"),
        shellNotice("n1", "completed"),
        shellNotice("n2", "error"),
      ],
      "compact",
    );

    const notices = rows.filter((row) => row.entry?.role === "notice");
    expect(notices.map((row) => row.entry?.key)).toEqual(["n1", "n2"]);
    expect(notices[1].entry?.notice?.state).toBe("error");
    // The tool group before the reports keeps its own row.
    expect(rows.findIndex((row) => row.parts)).toBeLessThan(
      rows.findIndex((row) => row.entry?.key === "n1"),
    );
  });

  test("every row key is unique even when background reports carry no id", () => {
    // Three separate reports stay three rows with their own keys, even when
    // they carry no session or shell id to tell them apart.
    const bareNotice = (key: string): TimelineEntry => ({
      key,
      role: "notice",
      text: "background job",
      notice: { source: "shell", state: "completed", description: "background job" },
    });
    const rows = timelineRows(
      [
        user("u1"),
        bareNotice("n1"),
        tool("1", "grep"),
        bareNotice("n2"),
        tool("2", "grep"),
        bareNotice("n3"),
      ],
      "compact",
    );

    const keys = rows.map((row) => row.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(rows.filter((row) => row.entry?.role === "notice")).toHaveLength(3);
  });

  test("an interrupted turn splits the transcript with a divider", () => {    const aborted = tool("1", "shell", { failed: true, output: "aborted" });
    const rows = timelineRows([user("u1"), aborted, user("u2")], "compact");
    const divider = rows.find((row) => row.divider);
    expect(divider?.divider).toBe("Interrupted");
    // The divider sits between the interrupted turn and the next prompt.
    expect(rows.findIndex((row) => row.divider)).toBeLessThan(rows.findIndex((row) => row.entry?.key === "u2"));

    // A trailing interruption keeps the run footer as its only marker.
    const trailing = timelineRows([user("u1"), aborted], "compact");
    expect(trailing.some((row) => row.divider)).toBe(false);
    // A successful turn never splits.
    const ok = timelineRows([user("u1"), tool("2", "grep"), user("u2")], "compact");
    expect(ok.some((row) => row.divider)).toBe(false);
  });

  test("the active turn carries its retry and error rows", () => {
    const rows = timelineRows([user("u1"), tool("1", "grep")], "compact", {
      running: true,
      retry: { attempt: 2, next: "2026-01-01T00:00:05Z", message: "rate limited" },
      error: "stream failed",
    });

    expect(rows[rows.length - 2]?.retry?.message).toBe("rate limited");
    expect(rows[rows.length - 1]?.error).toBe("stream failed");
  });

  test("turn diffs follow their own turn and wait while that turn runs", () => {
    const entries = [user("u1"), edit("t1", "a.ts"), user("u2"), edit("t2", "b.ts")];

    const done = timelineRows(entries, "compact", { running: false, showTurnDiffs: true });
    const diffs = done.filter((row) => row.diff);
    expect(diffs).toHaveLength(2);
    expect(diffs[0].diff).toMatchObject({ files: 1, added: 1, removed: 1 });
    expect(done.findIndex((row) => row.diff) < done.findIndex((row) => row.entry?.key === "u2")).toBe(true);

    const running = timelineRows(entries, "compact", { running: true, showTurnDiffs: true });
    expect(running.filter((row) => row.diff)).toHaveLength(1);
  });
});

describe("cancelled tool results", () => {
  test("live events and history replay both keep the cancelled flag", () => {
    let chats: Record<string, ChatState> = {
      s1: {
        id: "s1",
        title: "S",
        draft: false,
        entries: [],
        running: true,
        tokens: 0,
        pending: [],
        questions: [],
      } as unknown as ChatState,
    };
    chats = applyEvent(chats, "s1", {
      type: "tool.call",
      sessionId: "s1",
      workspace: ".",
      data: { id: "c", name: "shell", arguments: "{}" },
    } as unknown as CoreEvent);
    chats = applyEvent(chats, "s1", {
      type: "tool.result",
      sessionId: "s1",
      workspace: ".",
      data: { id: "c", output: "aborted", failed: true, cancelled: true },
    } as unknown as CoreEvent);

    expect(chats.s1.entries[0]?.tool?.cancelled).toBe(true);

    const history = entriesFromMessages([
      { role: "tool", content: "aborted", toolCallId: "c", name: "shell", failed: true, cancelled: true },
    ]);
    expect(history[0]?.tool?.cancelled).toBe(true);
  });

  test("a stored compaction checkpoint becomes a divider row", () => {
    const history = entriesFromMessages([
      { role: "user", content: "old" },
      {
        role: "user",
        content: "<conversation-checkpoint/>",
        compaction: true,
        compactionCovered: 2,
        compactionReason: "manual",
      },
      { role: "user", content: "new" },
    ]);
    expect(history.map((entry) => entry.role)).toEqual(["user", "compaction", "user"]);
    expect(history[1]?.compaction?.summary).toBe("<conversation-checkpoint/>");
    expect(history[1]?.compaction?.covered).toBe(2);
    expect(history[1]?.compaction?.reason).toBe("manual");
  });
});
