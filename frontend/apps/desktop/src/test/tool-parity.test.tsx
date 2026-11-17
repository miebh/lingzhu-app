import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { Messages } from "@lingzhu/session-ui/Messages";
import { SessionHeader } from "@/components/SessionHeader";
import { applyEvent } from "@/lib/chat-events";
import { setLanguage } from "@lingzhu/ui/i18n";
import { TimelineSection } from "@/components/settings/TimelineSection";
import { TooltipProvider } from "@lingzhu/ui/tooltip";
import { defaultPreferences } from "@/lib/preferences";
import { entriesFromMessages, type ChatState, type TimelineEntry } from "@lingzhu/ui/types";

const chat = (entries: TimelineEntry[]): ChatState =>
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

const tool = (id: string, name: string, argumentsJson = "{}", extra: Partial<TimelineEntry["tool"]> = {}): TimelineEntry => ({
  key: `tool-${id}`,
  role: "tool",
  tool: { id, name, arguments: argumentsJson, done: true, ...extra },
});

describe("tool timeline parity", () => {
  test("an interrupted tool renders as cancelled, not an error", async () => {
    render(
      <TooltipProvider>
        <Messages
          detail="everything"
          chat={chat([
            tool("1", "shell", '{"command":"sleep 10"}', {
              output: "partial output",
              failed: true,
              cancelled: true,
            }),
          ])}
        />
      </TooltipProvider>,
    );

    await waitFor(() => expect(screen.getByText("Cancelled")).toBeTruthy());
    expect(screen.queryByText(/Tool failed/i)).toBeNull();
  });

  test("compact folds reads and shell into one Used summary", async () => {
    render(
      <TooltipProvider>
        <Messages
          chat={chat([
            tool("1", "read", '{"path":"src/a.ts"}'),
            tool("2", "shell", '{"command":"echo hi"}', { output: "hi" }),
          ])}
        />
      </TooltipProvider>,
    );

    await waitFor(() => expect(screen.getByRole("button", { name: /Used 2 Read, Shell/ })).toBeTruthy());
  });

  test("everything separates a thought and renders file changes as an accordion", async () => {
    const diff = "--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-old\n+new\n";
    render(
      <TooltipProvider>
        <Messages
          detail="everything"
          chat={chat([
            { key: "r", role: "reasoning", text: "thinking", live: false },
            tool("1", "edit", '{"path":"src/a.ts"}', { diff }),
          ])}
        />
      </TooltipProvider>,
    );

    await waitFor(() => expect(screen.getByText("Thought")).toBeTruthy());
    expect(screen.getAllByText(/a\.ts/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("new").length).toBeGreaterThan(0);
  });

  test("a running child keeps its subagent card spinning", () => {
    const subagent = tool("1", "subagent", '{"agent":"general","description":"inspect"}', {
      output: "done",
      metadata: { sessionID: "sub_1" },
    });

    const { rerender } = render(
      <TooltipProvider>
        <Messages detail="everything" chat={chat([subagent])} runningSubagents={new Set(["sub_1"])} />
      </TooltipProvider>,
    );
    expect(document.querySelector('[data-component="activity-ring"]')).toBeTruthy();

    rerender(
      <TooltipProvider>
        <Messages detail="everything" chat={chat([subagent])} />
      </TooltipProvider>,
    );
    expect(document.querySelector('[data-component="activity-ring"]')).toBeNull();
  });

  test("an edit without a result diff previews its own change", async () => {
    render(
      <TooltipProvider>
        <Messages
          detail="everything"
          chat={chat([
            tool("1", "edit", '{"path":"src/a.ts","oldString":"const a = 1;","newString":"const a = 2;"}'),
          ])}
        />
      </TooltipProvider>,
    );

    await waitFor(() => expect(screen.getByText("a.ts")).toBeTruthy());
    // The reference opens edit details under the expanded preset, and the
    // preview comes from the tool's own oldString/newString.
    await waitFor(() => expect(document.querySelector('[data-slot="diff-line"]')).toBeTruthy());
  });

  test("a background shell streams its job output", async () => {
    const shell = tool("job-shell", "shell", '{"command":"npm test","background":true}', {
      done: false,
      metadata: { shellID: "job_1", background: true },
    });
    const load = vi.fn(async (_id: string, cursor: number) => ({
      output: cursor === 0 ? "first line\n" : "second line\n",
      cursor: cursor + 1,
    }));

    render(
      <TooltipProvider>
        <Messages
          detail="everything"
          chat={chat([shell])}
          shellOutput={() => ({ id: "job_1", running: true, load })}
        />
      </TooltipProvider>,
    );

    await waitFor(() => expect(load).toHaveBeenCalled());
    // The everything preset opens shell details, so the streamed output is
    // visible without a second click.
    await waitFor(() => expect(document.querySelector('[data-slot="bash-result"]')).toBeTruthy());
    expect(document.querySelector('[data-slot="bash-result"]')?.textContent).toContain("first line");
  });

  test("execute details share one number gutter between code and output", async () => {
    render(
      <TooltipProvider>
        <Messages
          detail="everything"
          chat={chat([
            tool("1", "execute", '{"code":"return 1\\nreturn 2"}', {
              output: "one\ntwo\nthree",
              metadata: { toolCalls: [] },
            }),
          ])}
        />
      </TooltipProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "View code" }));
    const numbers = await waitFor(() => {
      const found = document.querySelectorAll('[data-slot="source-number"]');
      expect(found.length).toBeGreaterThan(2);
      return found;
    });
    expect(numbers[0].textContent).toBe("1");
    const details = document.querySelector('[data-component="execute-details"]') as HTMLElement;
    expect(details.style.getPropertyValue("--execute-details-number-width")).toBe("1ch");
  });

  test("a list row shows its directory and never the raw listing", async () => {
    const { rerender } = render(
      <TooltipProvider>
        <Messages detail="everything" chat={chat([tool("1", "list", '{"path":"/repo"}', { done: false })])} />
      </TooltipProvider>,
    );

    expect(screen.getByText("/repo")).toBeTruthy();

    rerender(
      <TooltipProvider>
        <Messages detail="everything" chat={chat([tool("1", "list", '{"path":"/repo"}', { output: "PEAK" })])} />
      </TooltipProvider>,
    );
    // The reference shows what was searched, never the raw list it returned.
    expect(screen.queryByText("PEAK")).toBeNull();
    expect(screen.getByText("/repo")).toBeTruthy();
  });

  test("loaded instruction paths shorten against the workspace", async () => {
    render(
      <TooltipProvider>
        <Messages
          workspace="/repo"
          detail="everything"
          chat={chat([
            tool("1", "read", '{"path":"/repo/sub/a.ts"}', {
              metadata: { loaded: ["/repo/sub/AGENTS.md"] },
            }),
          ])}
        />
      </TooltipProvider>,
    );

    await waitFor(() => expect(screen.getByText("sub/AGENTS.md")).toBeTruthy());
    expect(screen.queryByText("/repo/sub/AGENTS.md")).toBeNull();
  });

  test("compact folds a notice into the tool group", async () => {
    render(
      <TooltipProvider>
        <Messages
          chat={chat([
            tool("1", "grep", '{"pattern":"todo"}'),
            {
              key: "n1",
              role: "notice",
              text: "background job",
              notice: { source: "form", state: "completed", description: "background job" },
            },
          ])}
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Used 1 Grep/ }));
    await waitFor(() => expect(screen.getByText("Form finished · background job")).toBeTruthy());
  });

  test("a failed tool renders the transparent error card with its summary", async () => {
    render(
      <TooltipProvider>
        <Messages
          detail="everything"
          chat={chat([tool("1", "shell", '{"command":"false"}', { failed: true, output: "Error: boom" })])}
        />
      </TooltipProvider>,
    );

    await waitFor(() => expect(screen.getByText("Boom")).toBeTruthy());
    expect(screen.getByText("Shell")).toBeTruthy();
  });

  test("execute renders nested calls from result metadata", async () => {
    render(
      <TooltipProvider>
        <Messages
          detail="everything"
          chat={chat([
            tool("1", "execute", '{"code":"const x = await tool(\\"read\\", {path:\\"a.ts\\"}); return x"}', {
              done: true,
              metadata: {
                code: 'const x = await tool("read", {path:"a.ts"}); return x',
                toolCalls: [{ tool: "read", status: "completed", input: { path: "a.ts" } }],
                output: "hello",
              },
            }),
          ])}
        />
      </TooltipProvider>,
    );

    await waitFor(() => expect(screen.getByText("Execute")).toBeTruthy());
    await userEvent.click(screen.getByRole("button", { name: /Execute/ }));
    expect(screen.getByText("read")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /Output/ }));
    expect(screen.getByText("hello")).toBeTruthy();
  });

  test("stored execute results keep their nested call metadata", async () => {
    const entries = entriesFromMessages([
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "call_1", name: "execute", arguments: '{"code":"return 1"}' }],
      },
      {
        role: "tool",
        content: "hello",
        toolCallId: "call_1",
        name: "execute",
        metadata: {
          toolCalls: [{ tool: "read", status: "completed", input: { path: "a.ts" } }],
          output: "hello",
        },
      },
    ]);

    render(
      <TooltipProvider>
        <Messages detail="everything" chat={chat(entries)} />
      </TooltipProvider>,
    );

    await waitFor(() => expect(screen.getByText("Execute")).toBeTruthy());
    await userEvent.click(screen.getByRole("button", { name: /Execute/ }));
    expect(screen.getByText("read")).toBeTruthy();
  });

  test("execute localizes its chrome", async () => {
    setLanguage("zh");
    render(
      <TooltipProvider>
        <Messages
          detail="everything"
          chat={chat([
            tool("2", "execute", '{"code":"const a = 1;\\n// note"}', {
              done: true,
              metadata: {
                code: "const a = 1;\n// note",
                toolCalls: [{ tool: "read", status: "completed", input: { path: "a.ts" } }],
                output: "hi",
              },
            }),
          ])}
        />
      </TooltipProvider>,
    );

    await waitFor(() => expect(screen.getByText("执行")).toBeTruthy());
    await userEvent.click(screen.getByRole("button", { name: /执行/ }));
    await userEvent.click(screen.getByRole("button", { name: "查看代码" }));

    expect(await screen.findByText("代码")).toBeTruthy();
    expect(screen.getByText("1 次调用")).toBeTruthy();
    expect(screen.getAllByText("输出").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1 行").length).toBe(2);

    const dialog = await screen.findByRole("dialog");
    expect(dialog.querySelector(".tok-keyword")?.textContent).toBe("const");
    setLanguage("en");
  });

  test("tool timeline localizes read and shell", async () => {
    setLanguage("zh");
    render(
      <TooltipProvider>
        <Messages
          detail="everything"
          chat={chat([
            tool("read-1", "read", '{"path":"a.ts"}'),
            tool("shell-1", "shell", '{"command":"echo hi"}', { output: "hi" }),
          ])}
        />
      </TooltipProvider>,
    );

    await waitFor(() => expect(screen.getByText("读取")).toBeTruthy());
    expect(screen.getByText("命令")).toBeTruthy();
    setLanguage("en");
  });

  test("edit diagnostics and loaded file metadata are rendered", async () => {
    render(
      <TooltipProvider>
        <Messages
          detail="everything"
          chat={chat([
            tool("1", "read", '{"path":"AGENTS.md"}', { metadata: { loaded: ["/repo/AGENTS.md"] } }),
            tool("2", "edit", '{"path":"a.ts"}', {
              diff: "--- a/a.ts\n+++ b/a.ts\n+x\n",
              metadata: { diagnostics: [{ severity: "error", message: "expected ';'", line: 2, column: 3 }] },
            }),
            tool("3", "websearch", '{"query":"today"}', {
              output: "https://a.example",
              metadata: { provider: "brave" },
            }),
          ])}
        />
      </TooltipProvider>,
    );

    await waitFor(() => expect(screen.getByText("Loaded")).toBeTruthy());
    expect(screen.getByText("/repo/AGENTS.md")).toBeTruthy();
    expect(screen.getByText("expected ';'")).toBeTruthy();
    expect(screen.getByText("[2:3]")).toBeTruthy();
    expect(screen.getByText("Brave Web Search")).toBeTruthy();
  });

  test("assistant.message creates reasoning when no live delta arrived", () => {
    const next = applyEvent({ s1: chat([]) }, "s1", {
      workspace: ".",
      sessionId: "s1",
      seq: 1,
      type: "assistant.message",
      at: "2026-01-01T00:01:05Z",
      data: {
        text: "answer",
        reasoning: "## Plan\n\nThink first.",
        reasoningCreated: "2026-01-01T00:00:00Z",
        reasoningCompleted: "2026-01-01T00:01:05Z",
      },
    });

    expect(next.s1.entries.map((entry) => entry.role)).toEqual(["reasoning", "assistant"]);
    expect(next.s1.entries[0].text).toBe("## Plan\n\nThink first.");
    expect(next.s1.entries[0].created).toBe("2026-01-01T00:00:00Z");
    expect(next.s1.entries[0].endedAt).toBe("2026-01-01T00:01:05Z");
  });

  test("stored parts keep interleaved reasoning and text order", () => {
    const entries = entriesFromMessages([
      {
        role: "assistant",
        content: "aggregated answer",
        reasoning: "aggregated reasoning",
        parts: [
          { type: "reasoning", text: "first thought", created: "2026-01-01T00:00:00Z", completed: "2026-01-01T00:00:02Z" },
          { type: "text", text: "working on it" },
          { type: "reasoning", text: "second thought", created: "2026-01-01T00:00:03Z", completed: "2026-01-01T00:00:05Z" },
          { type: "text", text: "final answer" },
        ],
      },
    ]);

    expect(entries.map((entry) => [entry.role, entry.text])).toEqual([
      ["reasoning", "first thought"],
      ["assistant", "working on it"],
      ["reasoning", "second thought"],
      ["assistant", "final answer"],
    ]);
    expect(entries[0].created).toBe("2026-01-01T00:00:00Z");
    expect(entries[0].endedAt).toBe("2026-01-01T00:00:02Z");
    expect(entries[2].created).toBe("2026-01-01T00:00:03Z");
  });

  test("stored reasoning keeps its timestamps for the history duration", () => {
    const entries = entriesFromMessages([
      {
        role: "assistant",
        content: "answer",
        reasoning: "## Plan\n\nThink first.",
        reasoningCreated: "2026-01-01T00:00:00Z",
        reasoningCompleted: "2026-01-01T00:01:05Z",
      },
    ]);

    expect(entries.map((entry) => entry.role)).toEqual(["reasoning", "assistant"]);
    expect(entries[0].created).toBe("2026-01-01T00:00:00Z");
    expect(entries[0].endedAt).toBe("2026-01-01T00:01:05Z");
  });

  test("stored failures keep their error card instead of splitting the group", async () => {
    const entries = entriesFromMessages([
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "call_1", name: "grep", arguments: "{}" }],
      },
      { role: "tool", content: "boom", toolCallId: "call_1", name: "grep", failed: true },
      { role: "tool", content: "ok", toolCallId: "call_2", name: "grep" },
    ]);

    const failed = entries.find((entry) => entry.tool?.failed);
    expect(failed?.tool?.failed).toBe(true);

    const { container } = render(
      <TooltipProvider>
        <Messages detail="compact" chat={chat(entries)} />
      </TooltipProvider>,
    );

    // One summary block, not two split around the failure.
    const groups = container.querySelectorAll('[data-component="collapsed-tool-group"]');
    expect(groups).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: /Used 2 Grep/ }));
    await waitFor(() => expect(container.querySelector('[data-kind="tool-error-card"]')).toBeTruthy());
  });

  test("stored instruction loads become a Loaded row", () => {
    const entries = entriesFromMessages([
      {
        role: "user",
        content: "Instructions from: /repo/AGENTS.md",
        synthetic: true,
        syntheticDescription: "Loaded AGENTS.md",
        syntheticPaths: ["AGENTS.md"],
      },
    ]);

    expect(entries.map((entry) => entry.role)).toEqual(["loaded"]);
    expect(entries[0].loaded).toEqual(["AGENTS.md"]);
  });

  test("synthetic instructions fold into a loaded transcript row", async () => {
    const next = applyEvent(
      { s1: chat([]) },
      "s1",
      {
        workspace: ".",
        sessionId: "s1",
        seq: 1,
        type: "synthetic",
        at: "2026-01-01T00:00:00Z",
        data: { text: "Instructions from: /repo/sub/AGENTS.md\nUse tabs.", description: "Loaded sub/AGENTS.md", paths: ["sub/AGENTS.md"] },
      },
    );
    expect(next.s1.entries[0].role).toBe("loaded");
    expect(next.s1.entries[0].loaded).toEqual(["sub/AGENTS.md"]);

    // Separated notices keep the standalone "Loaded ..." row.
    render(
      <TooltipProvider>
        <Messages detail="everything" chat={next.s1} />
      </TooltipProvider>,
    );
    expect(screen.getByText("Loaded")).toBeTruthy();
    expect(screen.getByText("sub/AGENTS.md")).toBeTruthy();
  });

  test("compact folds an instruction load into the summary block", async () => {
    const next = applyEvent(
      { s1: chat([tool("loaded-run", "grep")]) },
      "s1",
      {
        workspace: ".",
        sessionId: "s1",
        seq: 1,
        type: "synthetic",
        at: "2026-01-01T00:00:00Z",
        data: { text: "Instructions from: /repo/AGENTS.md", description: "Loaded AGENTS.md", paths: ["AGENTS.md"] },
      },
    );

    const { container } = render(
      <TooltipProvider>
        <Messages detail="compact" chat={next.s1} />
      </TooltipProvider>,
    );

    // One block, and the load sits inside it rather than splitting the run.
    expect(container.querySelectorAll('[data-component="collapsed-tool-group"]')).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: /Used 1 Grep/ }));
    await waitFor(() =>
      expect(container.querySelector('[data-component="tool-loaded-item"]')?.textContent).toContain("AGENTS.md"),
    );
  });

  test("synthetic descriptions without paths become notices", async () => {
    const next = applyEvent({ s1: chat([]) }, "s1", {
      workspace: ".",
      sessionId: "s1",
      seq: 1,
      type: "synthetic",
      at: "2026-01-01T00:00:00Z",
      data: { text: "hello", description: "External note" },
    });
    expect(next.s1.entries[0].role).toBe("notice");
    expect(next.s1.entries[0].text).toBe("External note");
  });

  test("background job and subagent completions become notice rows", async () => {
    let next = applyEvent({ s1: chat([]) }, "s1", {
      workspace: ".",
      sessionId: "s1",
      seq: 1,
      type: "job.completed",
      at: "2026-01-01T00:00:00Z",
      data: { command: "npm test", status: "completed" },
    });
    next = applyEvent(next, "s1", {
      workspace: ".",
      sessionId: "s1",
      seq: 2,
      type: "subagent.completed",
      at: "2026-01-01T00:00:01Z",
      data: { description: "inspect tests", status: "failed" },
    });

    expect(next.s1.entries.map((entry) => entry.role)).toEqual(["notice", "notice"]);

    render(
      <TooltipProvider>
        <Messages chat={next.s1} />
      </TooltipProvider>,
    );
    // Every report keeps its own terminal outcome.
    const rows = await waitFor(() => {
      const found = document.querySelectorAll<HTMLElement>('[data-slot="session-timeline-notice"]');
      expect(found).toHaveLength(2);
      return found;
    });
    expect(rows[0].textContent).toContain("Shell finished · npm test");
    expect(rows[1].textContent).toContain("Subagent failed · inspect tests");
  });

  test("instruction updates name their changed sources and carry no outcome", async () => {
    const next = applyEvent({ s1: chat([]) }, "s1", {
      workspace: ".",
      sessionId: "s1",
      seq: 1,
      type: "synthetic",
      at: "2026-01-01T00:00:00Z",
      data: {
        text: "The harness instructions changed.",
        source: "instructions",
        description: "Instructions updated",
        sources: ["agents", "environment"],
      },
    });

    const notice = next.s1.entries[0].notice;
    expect(notice?.state).toBeUndefined();
    expect(notice?.sources).toEqual(["agents", "environment"]);

    render(
      <TooltipProvider>
        <Messages chat={next.s1} detail="everything" />
      </TooltipProvider>,
    );
    const row = await waitFor(() => {
      const found = document.querySelector<HTMLElement>('[data-slot="session-timeline-notice"]');
      expect(found).toBeTruthy();
      return found!;
    });
    expect(row.textContent).toContain("Instructions updated · AGENTS.md, Environment");
    expect(row.getAttribute("data-outcome")).toBeNull();

    // History carries the same sources through the stored message.
    const history = entriesFromMessages([
      {
        role: "user",
        content: "The harness instructions changed.",
        synthetic: true,
        syntheticSource: "instructions",
        syntheticDescription: "Instructions updated",
        syntheticSources: ["agents", "environment"],
      },
    ]);
    expect(history[0].notice?.sources).toEqual(["agents", "environment"]);
    expect(history[0].notice?.state).toBeUndefined();
  });

  test("stored synthetic shell completions render as notices instead of user messages", async () => {
    const entries = entriesFromMessages([
      {
        role: "user",
        content: "[Background shell completed]\nJob: job_1",
        synthetic: true,
        syntheticSource: "shell",
        syntheticDescription: "npm test",
        syntheticState: "completed",
      },
    ]);
    expect(entries.map((entry) => entry.role)).toEqual(["notice"]);

    render(
      <TooltipProvider>
        <Messages chat={chat(entries)} />
      </TooltipProvider>,
    );
    const row = await waitFor(() => {
      const found = document.querySelector<HTMLElement>('[data-slot="session-timeline-notice"]');
      expect(found).toBeTruthy();
      return found!;
    });
    expect(row.textContent).toContain("Shell finished · npm test");
    expect(screen.queryByText(/Background shell completed/)).toBeNull();
  });

  test("advanced placement switches update the persisted detail map", async () => {
    const save = vi.fn();
    render(
      <TimelineSection
        preferences={{
          preferences: { ...defaultPreferences, appearance: { ...defaultPreferences.appearance } },
          save,
        }}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Advanced" }));
    await userEvent.click(screen.getByRole("switch", { name: "Group Shell" }));

    expect(save).toHaveBeenCalled();
    expect(save.mock.calls[0][0].appearance.timelineDetail.shell.placement).toBe("separate");
  });

  test("a subagent renders as a task card that opens its child session", async () => {
    render(
      <TooltipProvider>
        <Messages
          detail="everything"
          onOpenSession={() => undefined}
          chat={chat([
            tool(
              "1",
              "subagent",
              JSON.stringify({ agent: "general", description: "inspect tests" }),
              { done: false, output: "sessionID: sub_42" },
            ),
          ])}
        />
      </TooltipProvider>,
    );

    await waitFor(() => expect(screen.getByText("General")).toBeTruthy());
    expect(screen.getByText(/inspect tests/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open General session" })).toBeTruthy();
  });

  test("long transcripts mount only a window of timeline rows", async () => {
    const entries = Array.from({ length: 200 }, (_, index) => ({
      key: `assistant-${index}`,
      role: "assistant" as const,
      text: `reply ${index}`,
    }));
    const { container } = render(
      <TooltipProvider>
        <Messages chat={chat(entries)} />
      </TooltipProvider>,
    );

    expect(container.querySelector('[data-virtualized="true"]')).toBeTruthy();
    expect(container.querySelectorAll("[data-row-key]").length).toBeLessThan(60);
    expect(container.querySelector('[data-slot="timeline-virtual-content"]')).toBeTruthy();

    const scroll = container.querySelector<HTMLElement>('[data-virtualized="true"]')!;
    scroll.scrollTop = 8400;
    fireEvent.scroll(scroll);
    await waitFor(() => {
      const first = container.querySelector("[data-row-key]")?.getAttribute("data-row-key");
      expect(first).toMatch(/assistant-9\d/);
    });
  });

  test("long tool timelines window groups and place rows absolutely", async () => {
    const entries: TimelineEntry[] = [];
    for (let index = 0; index < 30; index += 1) {
      entries.push({ key: `u${index}`, role: "user", text: `ask ${index}` });
      entries.push({ key: `a${index}`, role: "assistant", text: `answer ${index}` });
      entries.push({
        key: `t${index}`,
        role: "tool",
        tool: { id: `read-${index}`, name: "read", arguments: `{"path":"f${index}.ts"}`, done: true },
      });
      entries.push({
        key: `g${index}`,
        role: "tool",
        tool: { id: `grep-${index}`, name: "grep", arguments: `{"pattern":"x${index}"}`, done: true },
      });
    }
    const { container } = render(
      <TooltipProvider>
        <Messages detail="compact" chat={chat(entries)} />
      </TooltipProvider>,
    );

    await waitFor(() => expect(container.querySelector("[data-component='collapsed-tool-group']")).toBeTruthy());
    expect(container.querySelector('[data-virtualized="true"]')).toBeTruthy();
    const range = container.querySelector<HTMLElement>('[data-virtualized="true"]')?.dataset.virtualRange;
    expect(range).toMatch(/^\d+-\d+$/);

    const first = container.querySelector<HTMLElement>("[data-row-key]");
    // Rows position with `top`, not `transform`: a transformed row would
    // become the containing block for the sticky tool summary and stop it
    // from masking the top of the transcript.
    expect(first?.style.top).toMatch(/^\d+px$/);
    expect(first?.style.transform).toBe("");
    expect(container.querySelectorAll("[data-row-key]").length).toBeLessThan(60);
  });

  test("large diffs render a virtualized window of rows", async () => {
    const body = Array.from({ length: 300 }, (_, index) => `+const value${index} = ${index};`).join("\n");
    const diff = `--- a/a.ts\n+++ b/a.ts\n@@ -1 +1,300 @@\n${body}\n`;
    const { container } = render(
      <TooltipProvider>
        <Messages
          detail="everything"
          chat={chat([tool("large-diff", "edit", '{"path":"a.ts"}', { diff })])}
        />
      </TooltipProvider>,
    );

    const scroll = await waitFor(() => container.querySelector('[data-slot="diff-scroll"]'));
    expect(scroll?.getAttribute("data-virtualized")).toBe("true");
    expect(container.querySelectorAll('[data-slot="diff-line"]').length).toBeLessThan(100);
    expect(container.querySelector(".tok-keyword")?.textContent).toBe("const");
  });

  test("write renders only its file row while edit keeps the tool header", async () => {
    const { rerender } = render(
      <TooltipProvider>
        <Messages
          detail="everything"
          chat={chat([
            tool("1", "write", '{"path":"a.ts","content":"x"}', {
              diff: "--- a/a.ts\n+++ b/a.ts\n+x\n",
            }),
          ])}
        />
      </TooltipProvider>,
    );
    await waitFor(() => expect(screen.getAllByText(/a\.ts/).length).toBeGreaterThan(0));
    expect(screen.queryByText("Write")).toBeNull();

    rerender(
      <TooltipProvider>
        <Messages
          detail="everything"
          chat={chat([
            tool("1", "edit", '{"path":"a.ts"}', {
              diff: "--- a/a.ts\n+++ b/a.ts\n+x\n",
            }),
          ])}
        />
      </TooltipProvider>,
    );
    expect(screen.getByText("Edit")).toBeTruthy();
  });

  test("question answers come from result metadata", async () => {
    render(
      <TooltipProvider>
        <Messages
          detail="everything"
          chat={chat([
            tool("1", "question", JSON.stringify({ questions: [{ question: "Which one?" }] }), {
              metadata: { answers: [["Alpha"]] },
            }),
          ])}
        />
      </TooltipProvider>,
    );
    await waitFor(() => expect(screen.getByText("Which one?")).toBeTruthy());
    expect(screen.getByText("Alpha")).toBeTruthy();
  });

  test("websearch provider title and overflow count follow the reference", async () => {
    const output = Array.from({ length: 12 }, (_, index) => `https://example.com/${index}`).join("\n");
    render(
      <TooltipProvider>
        <Messages
          detail="everything"
          chat={chat([tool("1", "websearch", '{"query":"today"}', { output, metadata: { provider: "brave" } })])}
        />
      </TooltipProvider>,
    );
    await waitFor(() => expect(screen.getByText("Brave Web Search")).toBeTruthy());
    await userEvent.click(screen.getByRole("button", { name: /Brave Web Search/ }));
    await userEvent.click(screen.getByRole("button", { name: "+2 more" }));
    expect(screen.getAllByRole("link")).toHaveLength(12);
  });

  test("diagnostics keep only the first three errors with bracketed locations", async () => {
    const diagnostics = Array.from({ length: 4 }, (_, index) => ({
      severity: "error",
      message: `problem ${index}`,
      line: index + 1,
      column: index + 1,
    }));
    render(
      <TooltipProvider>
        <Messages
          detail="everything"
          chat={chat([
            tool("1", "edit", '{"path":"a.ts"}', {
              diff: "--- a/a.ts\n+++ b/a.ts\n+x\n",
              metadata: { diagnostics },
            }),
          ])}
        />
      </TooltipProvider>,
    );
    await waitFor(() => expect(screen.getByText("[1:1]")).toBeTruthy());
    expect(screen.getByText("[3:3]")).toBeTruthy();
    expect(screen.queryByText("[4:4]")).toBeNull();
  });

  test("execute shows a runtime failure on the failing call row", async () => {
    render(
      <TooltipProvider>
        <Messages
          detail="everything"
          chat={chat([
            tool("execute-fail", "execute", '{"code":"await tool(\\"shell\\", {command: \\"false\\"})"}', {
              failed: true,
              metadata: {
                code: 'await tool("shell", {command: "false"})',
                toolCalls: [{ tool: "shell", status: "error", input: { command: "false" } }],
                errorMessage: "boom",
                error: true,
              },
            }),
          ])}
        />
      </TooltipProvider>,
    );
    await userEvent.click(await screen.findByRole("button", { name: /Execute/ }));
    expect(screen.getByText("shell")).toBeTruthy();
    expect(screen.queryByText("Output")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /shell/ }));
    expect(screen.getByText("boom")).toBeTruthy();
  });

  test("the shell console is a scrollable region with the reference copy label", async () => {
    render(
      <TooltipProvider>
        <Messages
          detail="everything"
          chat={chat([tool("shell-scroll", "shell", '{"command":"echo hi"}', { output: "hi" })])}
        />
      </TooltipProvider>,
    );
    await waitFor(() => expect(screen.getByRole("region", { name: "Scrollable content" })).toBeTruthy());
    expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
  });

  test("session header shows the worktree and opens an ancestor", async () => {
    const onOpenSession = vi.fn();
    render(
      <TooltipProvider>
        <SessionHeader
          workspace="lingzhu"
          worktree="feature/parity"
          title="Child task"
          ancestors={[
            { id: "p1", title: "Root task" },
            { id: "p2", title: "Parent task" },
          ]}
          onOpenSession={onOpenSession}
        />
      </TooltipProvider>,
    );

    expect(screen.getByRole("button", { name: "lingzhu" })).toBeTruthy();
    expect(screen.getByText("Root task")).toBeTruthy();
    await userEvent.click(screen.getByText("Parent task"));
    expect(onOpenSession).toHaveBeenCalledWith("p2");
  });

  test("a top-level session header shows its worktree", () => {
    render(
      <TooltipProvider>
        <SessionHeader workspace="lingzhu" worktree="feature/parity" title="Main task" />
      </TooltipProvider>,
    );
    expect(screen.getByRole("button", { name: "lingzhu / feature/parity" })).toBeTruthy();
  });
});

describe("assistant markdown surfaces", () => {
  test("a fenced block highlights through the shared syntax roles", () => {
    const { container } = render(
      <TooltipProvider>
        <Messages
          detail="everything"
          chat={chat([
            {
              key: "a1",
              role: "assistant",
              text: '```ts\nconst answer = "yes";\n```',
            },
          ])}
        />
      </TooltipProvider>,
    );

    const code = container.querySelector(".markdown-code code");
    expect(code?.querySelector(".tok-keyword")?.textContent).toBe("const ");
    expect(code?.querySelector(".tok-string")?.textContent).toBe('"yes"');
    // Line structure survives highlighting.
    expect(code?.querySelectorAll('[data-slot="markdown-code-line"]')).toHaveLength(1);
  });

  test("a mermaid fence renders a diagram and hides its source", async () => {
    const { container } = render(
      <TooltipProvider>
        <Messages
          detail="everything"
          chat={chat([
            {
              key: "a2",
              role: "assistant",
              text: "```mermaid\nflowchart LR\n  A[Start] --> B[Done]\n```",
            },
          ])}
        />
      </TooltipProvider>,
    );

    await waitFor(() => expect(container.querySelector('[data-component="markdown-mermaid"]')).toBeTruthy());
    const diagram = container.querySelector('[data-component="markdown-mermaid"]')!;
    expect(diagram.querySelector("svg")).toBeTruthy();
    expect(diagram.textContent).toContain("Start");
    expect(container.querySelector(".markdown-code pre")?.hasAttribute("hidden")).toBe(true);
  });
});
