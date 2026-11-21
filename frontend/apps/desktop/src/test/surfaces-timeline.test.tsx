import { fireEvent, render, screen, waitFor } from "./solid-testing";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { TextShimmer } from "@lingzhu/ui/TextShimmer";
import { TooltipProvider } from "@lingzhu/ui/tooltip";
import { Messages } from "@lingzhu/session-ui/Messages";
import { SessionHeader } from "@/components/session/SessionHeader";
import { setLanguage } from "@lingzhu/ui/i18n";
import type { TimelineEntry } from "@lingzhu/ui/types";
import { chat } from "./support/chat";

describe("timeline surfaces", () => {
  test("pending labels use the per-character shimmer with readable text", () => {
    const { container } = render(() => <TextShimmer active text="Thinking" />);
    expect(screen.getByText("Thinking")).toBeTruthy();
    expect(container.querySelectorAll('[data-slot="text-shimmer-char"]').length).toBe(8);
  });

  test("timeline renders tool groups and the turn diff summary", async () => {
    render(
      () => <Messages
        chat={chat([
          { key: "u1", role: "user", text: "fix it" },
          {
            key: "t1",
            role: "tool",
            tool: {
              id: "1",
              name: "read",
              arguments: "a",
              done: true,
              diff: "--- a/a.ts\n+++ b/a.ts\n+one\n-two\n",
            },
          },
          { key: "t2", role: "tool", tool: { id: "2", name: "grep", arguments: "b", done: true } },
        ])}
        detail="compact"
      />,
    );
    await waitFor(() => expect(screen.getByText("1 file changed")).toBeTruthy());
    expect(screen.getAllByText("Used").length).toBeGreaterThan(0);
    expect(screen.getByText("a.ts")).toBeTruthy();
  });

  test("apply_patch renders the file accordion instead of a generic row", async () => {
    render(
      () => <Messages
        chat={chat([
          {
            key: "p1",
            role: "tool",
            tool: {
              id: "p1",
              name: "apply_patch",
              arguments: "{}",
              done: true,
              diff: "--- a/a.ts\n+++ b/a.ts\n+new\n-old\n",
            },
          },
        ])}
        detail="compact"
      />,
    );
    expect(screen.getByText("Patch")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Used 1 Patch" }));
    expect(screen.getByText("a.ts")).toBeTruthy();
    expect(screen.queryByText("apply_patch")).toBeNull();
  });

  test("timeline shows Thinking for live reasoning", async () => {
    render(() => <Messages chat={chat([{ key: "r2", role: "reasoning", text: "working", live: true }])} />);
    await waitFor(() => expect(screen.getByText("Thinking")).toBeTruthy());
  });

  test("the working row shows the label alone, with no elapsed clock", () => {
    const running = chat([]);
    running.running = true;
    running.runStartedAt = Date.now() - 125_000;

    render(
      () => <TooltipProvider>
        <Messages chat={running} />
      </TooltipProvider>,
    );

    // The reference shows "Working" on its own; a "for 2m 5s" suffix is not part of it.
    expect(screen.getByText("Working")).toBeTruthy();
    expect(screen.queryByText(/Working for/)).toBeNull();
  });

  test("the working row stays visible while the turn streams text", () => {
    // It used to disappear as soon as text streamed in, which made it blink at
    // every phase change of the same turn.
    const running = chat([{ key: "a1", role: "assistant", text: "streaming", live: true }]);
    running.running = true;

    render(
      () => <TooltipProvider>
        <Messages chat={running} />
      </TooltipProvider>,
    );

    expect(screen.getByText("Working")).toBeTruthy();
  });

  test("the working row goes away once the turn ends", () => {
    const done = chat([{ key: "a1", role: "assistant", text: "finished" }]);
    done.running = false;
    done.lastRunStatus = "completed";

    render(
      () => <TooltipProvider>
        <Messages chat={done} />
      </TooltipProvider>,
    );

    expect(screen.queryByText("Working")).toBeNull();
  });

  test("the transcript has no message-level Quote action", async () => {
    render(
      () => <TooltipProvider>
        <Messages chat={chat([{ key: "a", role: "assistant", text: "Quoted answer" }])} onQuote={vi.fn()} />
      </TooltipProvider>,
    );
    await screen.findByText("Quoted answer");
    expect(screen.queryByRole("button", { name: "Quote" })).toBeNull();
  });

  test("selecting transcript text exposes the quote toolbar", async () => {
    const onQuote = vi.fn();
    render(
      () => <TooltipProvider>
        <Messages chat={chat([{ key: "a", role: "assistant", text: "Quoted answer" }])} onQuote={onQuote} />
      </TooltipProvider>,
    );
    const node = await screen.findByText("Quoted answer");
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    expect(selection.toString()).toBe("Quoted answer");
    const transcript = document.querySelector(".scroll-stable-both") as HTMLElement;
    expect(transcript.contains(node)).toBe(true);
    fireEvent.pointerUp(transcript);
    await userEvent.click(await screen.findByRole("button", { name: "Add" }));
    expect(onQuote).toHaveBeenCalledWith("Quoted answer");
  });

  test("user menu shows the sent time and the footer carries the model", async () => {
    setLanguage("en");
    const created = new Date().toISOString();
    render(
      () => <TooltipProvider>
        <Messages
          chat={chat([
            {
              key: "u1",
              role: "user",
              text: "hello",
              created,
              agent: "build",
              provider: "openai",
              model: "gpt-5",
            },
          ])}
        />
      </TooltipProvider>,
    );
    expect(screen.queryByText("Build")).toBeNull();
    expect(screen.getByText("gpt-5")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(await screen.findByText(/Today,/)).toBeTruthy();
    expect(screen.getByText("Copy message")).toBeTruthy();
  });

  test("showing agents restores the agent label", () => {
    render(
      () => <TooltipProvider>
        <Messages
          showAgent
          chat={chat([
            { key: "u1", role: "user", text: "hello", agent: "build", provider: "openai", model: "gpt-5" },
          ])}
        />
      </TooltipProvider>,
    );
    expect(screen.getByText("Build")).toBeTruthy();
  });

  test("a message without metadata keeps the footer free of the current agent", () => {
    render(
      () => <TooltipProvider>
        <Messages
          showAgent
          chat={{ ...chat([{ key: "u1", role: "user", text: "hello", model: "gpt-5" }]), agent: "build" }}
        />
      </TooltipProvider>,
    );
    expect(screen.queryByText("Build")).toBeNull();
    expect(screen.getByText("gpt-5")).toBeTruthy();
  });

  test("an interrupted turn names the interruption", () => {
    render(
      () => <TooltipProvider>
        <Messages
          chat={{
            ...chat([{ key: "a1", role: "assistant", text: "done", model: "gpt-5" }]),
            lastRunStatus: "stopped",
            lastRunMs: 1200,
          }}
        />
      </TooltipProvider>,
    );
    expect(screen.getByText("Interrupted")).toBeTruthy();
  });

  test("each finished turn footer keeps its own duration and throughput", () => {
    render(
      () => <TooltipProvider>
        <Messages
          chat={chat([
            { key: "u1", role: "user", text: "first", turn: { durationMs: 4200, tokensPerSecond: 12.3 } },
            { key: "a1", role: "assistant", text: "one" },
            { key: "u2", role: "user", text: "second", turn: { durationMs: 12000, tokensPerSecond: 45.6 } },
            { key: "a2", role: "assistant", text: "two" },
          ])}
        />
      </TooltipProvider>,
    );
    expect(screen.getByText("4.2s")).toBeTruthy();
    expect(screen.getByText("12.3 tok/s")).toBeTruthy();
    expect(screen.getByText("12.0s")).toBeTruthy();
    expect(screen.getByText("45.6 tok/s")).toBeTruthy();
  });

  test("a turn without recorded step timing hides the throughput", () => {
    render(
      () => <TooltipProvider>
        <Messages
          chat={chat([
            { key: "u1", role: "user", text: "hello" },
            { key: "a1", role: "assistant", text: "done", model: "gpt-5" },
          ])}
        />
      </TooltipProvider>,
    );
    expect(screen.queryByText(/tok\/s/)).toBeNull();
  });

  test("only the final assistant text offers copy", () => {
    render(
      () => <TooltipProvider>
        <Messages
          chat={chat([
            { key: "u1", role: "user", text: "hello" },
            { key: "a1", role: "assistant", text: "intermediate note" },
            { key: "a2", role: "assistant", text: "final answer", provider: "p", model: "old-model" },
          ])}
        />
      </TooltipProvider>,
    );
    const copies = screen.queryAllByRole("button", { name: "Copy response" });
    expect(copies).toHaveLength(1);
    expect(screen.queryByText("Build")).toBeNull();
    expect(screen.getByText("old-model")).toBeTruthy();
  });

  test("a running turn hides the copy footer", () => {
    render(
      () => <TooltipProvider>
        <Messages
          chat={{ ...chat([{ key: "a1", role: "assistant", text: "streaming" }]), running: true }}
        />
      </TooltipProvider>,
    );
    expect(screen.queryAllByRole("button", { name: "Copy response" })).toHaveLength(0);
  });

  test("user message menu offers fork, undo for the latest turn and revert for earlier ones", async () => {
    const onUndo = vi.fn();
    const onRevert = vi.fn();
    const onFork = vi.fn();
    render(
      () => <TooltipProvider>
        <Messages
          chat={chat([
            { key: "u1", role: "user", text: "first" },
            { key: "a1", role: "assistant", text: "answer" },
            { key: "u2", role: "user", text: "second" },
          ])}
          onUndo={onUndo}
          onRevert={onRevert}
          onFork={onFork}
          canUndo
        />
      </TooltipProvider>,
    );

    const actions = screen.getAllByRole("button", { name: "More actions" });
    await userEvent.click(actions[0]);
    await userEvent.click(await screen.findByText("Fork from here"));
    expect(onFork).toHaveBeenCalledWith("first");

    await userEvent.click(actions[0]);
    await userEvent.click(await screen.findByText("Revert to here"));
    expect(onRevert).toHaveBeenCalledWith("first", undefined);

    await userEvent.click(actions[1]);
    await userEvent.click(await screen.findByText("Undo"));
    expect(onUndo).toHaveBeenCalledWith("second");
  });

  test("the user message menu follows the selected language", async () => {
    setLanguage("zh");
    render(
      () => <TooltipProvider>
        <Messages
          chat={chat([
            { key: "u1", role: "user", text: "first" },
            { key: "a1", role: "assistant", text: "answer" },
            { key: "u2", role: "user", text: "second" },
          ])}
          onUndo={vi.fn()}
          onRevert={vi.fn()}
          onFork={vi.fn()}
          canUndo
        />
      </TooltipProvider>,
    );
    try {
      const actions = screen.getAllByRole("button", { name: "更多操作" });
      await userEvent.click(actions[0]);
      expect(await screen.findByText("回退到此处")).toBeTruthy();
      expect(screen.getByText("从此处创建新会话")).toBeTruthy();
      expect(screen.getByText("复制消息")).toBeTruthy();

      await userEvent.keyboard("{Escape}");
      await userEvent.click(actions[1]);
      expect(await screen.findByText("撤销")).toBeTruthy();
    } finally {
      setLanguage("en");
    }
  });

  test("the timeline has no visible user-message navigator", () => {
    render(
      () => <TooltipProvider>
        <Messages
          chat={chat([
            { key: "u1", role: "user", text: "first" },
            { key: "a1", role: "assistant", text: "answer" },
            { key: "u2", role: "user", text: "second" },
          ])}
        />
      </TooltipProvider>,
    );
    expect(screen.queryByRole("button", { name: "Next user message" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Previous user message" })).toBeNull();
    expect(screen.queryByText("1/2")).toBeNull();
  });

  test("timeline renders websearch result links", async () => {
    render(
      () => <TooltipProvider>
        <Messages
          chat={chat([
            {
              key: "w",
              role: "tool",
              tool: {
                id: "w",
                name: "websearch",
                arguments: "{}",
                done: true,
                output: "## [Alpha](https://a.example/x)\nsummary",
              },
            },
          ])}
          detail="everything"
        />
      </TooltipProvider>,
    );
    await userEvent.click(await screen.findByRole("button", { name: /Web Search/ }));
    await waitFor(() => expect(screen.getByRole("link", { name: /a\.example/ })).toBeTruthy());
  });

  test("the everything timeline separates reasoning and tools", async () => {
    render(
      () => <TooltipProvider>
        <Messages
          chat={chat([
            { key: "r", role: "reasoning", text: "first line\nsecond line", live: false },
            { key: "t1", role: "tool", tool: { id: "1", name: "read", arguments: "a", done: true } },
            { key: "t2", role: "tool", tool: { id: "2", name: "grep", arguments: "b", done: true } },
          ])}
          detail="everything"
        />
      </TooltipProvider>,
    );
    await waitFor(() => expect(screen.getByText(/second line/)).toBeTruthy());
    expect(screen.getByText("Read")).toBeTruthy();
    expect(screen.getByText("Grep")).toBeTruthy();
  });

  test("tool group expands from its Used summary", async () => {
    render(
      () => <TooltipProvider>
        <Messages
          chat={chat([
            { key: "t1", role: "tool", tool: { id: "1", name: "read", arguments: "a", done: true } },
            { key: "t2", role: "tool", tool: { id: "2", name: "grep", arguments: "b", done: true } },
          ])}
        />
      </TooltipProvider>,
    );
    await userEvent.click(await screen.findByRole("button", { name: /Used/ }));
    expect(await screen.findByText("Read")).toBeTruthy();
    expect(screen.getByText("Grep")).toBeTruthy();
  });

  test("the header context ring reports usage and opens the details pane", async () => {
    const onOpenDetails = vi.fn();
    render(
      () => <TooltipProvider>
        <SessionHeader
          workspace="lingzhu"
          title="Session one"
          context={{
            usage: {
              tokens: 2400,
              window: 8000,
              percent: 30,
              input: 2000,
              output: 400,
              cacheRead: 0,
              cacheWrite: 0,
              cost: 0.125,
            },
            detailsOpen: false,
            onOpenDetails,
          }}
        />
      </TooltipProvider>,
    );

    expect(screen.getByText("2K")).toBeTruthy();
    expect(screen.getByText("$0.13")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "View session details" }));
    expect(onOpenDetails).toHaveBeenCalledTimes(1);
  });

  test("session header menu runs an action", async () => {
    const onSelect = vi.fn();
    render(
      () => <SessionHeader
        workspace="Project"
        title="Session one"
        actions={[{ id: "rename", label: "Rename…", onSelect }]}
      />,
    );
    expect(screen.getByText("Session one")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Session menu" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Rename…" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  test("user image attachments render a thumbnail while their bytes are known", () => {
    render(
      () => <TooltipProvider>
        <Messages
          chat={chat([
            {
              key: "u1",
              role: "user",
              text: "",
              attachments: [{ mime: "image/png", name: "pixel.png", data: "AAA" }],
            },
          ])}
        />
      </TooltipProvider>,
    );
    const image = document.querySelector('img[src="data:image/png;base64,AAA"]');
    expect(image).toBeTruthy();
    expect(image?.getAttribute("alt")).toBe("pixel.png");
  });

  test("file attachments render a two-line 160px card with a type label", () => {
    render(
      () => <TooltipProvider>
        <Messages
          chat={chat([
            {
              key: "u1",
              role: "user",
              text: "look",
              attachments: [
                { mime: "text/plain", name: "src/attachments.ts", start: 3, end: 9 },
                { mime: "application/pdf", name: "spec.pdf" },
              ],
            },
          ])}
        />
      </TooltipProvider>,
    );
    const cards = document.querySelectorAll('[data-slot="user-message-attachment"][data-type="file"]');
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toContain("attachments.ts");
    expect(cards[0].textContent).toContain("TypeScript L3-9");
    expect(cards[1].textContent).toContain("PDF");
  });

  test("a pending prompt keeps its menu and shows the Pending meta", () => {
    render(
      () => <TooltipProvider>
        <Messages
          chat={chat([
            {
              key: "u1",
              role: "user",
              text: "waiting",
              pending: true,
              agent: "build",
              model: "test-model",
            },
          ])}
        />
      </TooltipProvider>,
    );
    expect(screen.getByText("Pending")).toBeTruthy();
    expect(screen.getByRole("button", { name: "More actions" })).toBeTruthy();
    const bubble = document.querySelector('[data-entry="user"] [data-pending="true"]');
    expect(bubble?.className).toContain("bg-bg-layer-01");
  });

  test("adjacent prompts only join a run when agent and model match", () => {
    render(
      () => <TooltipProvider>
        <Messages
          chat={chat([
            { key: "u1", role: "user", text: "one", agent: "build", model: "m1" },
            { key: "u2", role: "user", text: "two", agent: "build", model: "m1" },
            { key: "u3", role: "user", text: "three", agent: "plan", model: "m1" },
          ])}
        />
      </TooltipProvider>,
    );
    const bubbles = document.querySelectorAll('[data-entry="user"] > .group\\/bubble');
    // Joined corners are a data contract so the spring's inline radius and the
    // settled state can be asserted separately.
    expect(bubbles[0].getAttribute("data-run-bottom")).toBe("true");
    expect(bubbles[1].getAttribute("data-run-top")).toBe("true");
    expect(bubbles[2].getAttribute("data-run-top")).toBeNull();
  });

  test("PageDown scrolls 80% of the visible transcript area", async () => {
    const entries: TimelineEntry[] = Array.from({ length: 80 }, (_, index) => ({
      key: `a${index}`,
      role: "assistant" as const,
      text: `reply ${index}`,
    }));
    const { container } = render(
      () => <TooltipProvider>
        <Messages chat={chat(entries)} bottomInset={100} />
      </TooltipProvider>,
    );
    const scroll = container.querySelector<HTMLElement>(".scroll-stable-both")!;
    Object.defineProperty(scroll, "clientHeight", { value: 600, configurable: true });
    Object.defineProperty(scroll, "scrollHeight", { value: 4000, configurable: true });
    const before = scroll.scrollTop;
    fireEvent.keyDown(scroll, { key: "PageDown" });
    expect(scroll.scrollTop).toBeGreaterThan(before);
  });

  test("prompt rows expose a message anchor for hash navigation", () => {
    render(
      () => <TooltipProvider>
        <Messages chat={chat([{ key: "u1", role: "user", text: "anchor me" }])} />
      </TooltipProvider>,
    );
    const row = document.querySelector('[data-message-id="u1"]');
    expect(row).toBeTruthy();
    expect(row?.id).toBe("message-u1");
  });

  test("search highlights every occurrence through CSS Custom Highlight", async () => {
    const added: string[] = [];
    const registry = {
      size: 0,
      set: (name: string) => added.push(name),
      delete: () => undefined,
      clear: () => undefined,
    };
    const original = (CSS as unknown as { highlights?: unknown }).highlights;
    (CSS as unknown as { highlights?: unknown }).highlights = registry;
    (globalThis as { Highlight?: unknown }).Highlight = class { size = 1; add() {} };
    try {
      render(
        () => <TooltipProvider>
          <Messages
            chat={chat([
              { key: "a1", role: "assistant", text: "needle here and needle again" },
              { key: "a2", role: "assistant", text: "another needle" },
            ])}
          />
        </TooltipProvider>,
      );
      fireEvent.keyDown(window, { key: "f", ctrlKey: true });
      const field = await screen.findByLabelText("Search transcript");
      fireEvent.input(field, { target: { value: "needle" } });
      await waitFor(() => expect(added).toContain("timeline-search"));
      expect(added).toContain("timeline-search-active");
      expect(screen.getByText("1/3")).toBeTruthy();
    } finally {
      (CSS as unknown as { highlights?: unknown }).highlights = original;
      delete (globalThis as { Highlight?: unknown }).Highlight;
    }
  });

  test("older history loads behind a reveal row at the top", async () => {
    const onLoadOlder = vi.fn();
    const entries: TimelineEntry[] = Array.from({ length: 50 }, (_, index) => ({
      key: `a${index}`,
      role: "assistant" as const,
      text: `reply ${index}`,
    }));
    const base = chat(entries);
    const { rerender } = render(
      () => <TooltipProvider>
        <Messages chat={{ ...base, historyLimit: 20 }} onLoadOlder={onLoadOlder} />
      </TooltipProvider>,
    );

    const reveal = await screen.findByRole("button", { name: "Load older messages" });
    expect(document.querySelectorAll("[data-row-key]").length).toBe(20);
    expect(document.querySelector("[data-row-key]")?.getAttribute("data-row-key")).toBe("a30");
    fireEvent.click(reveal);
    expect(onLoadOlder).toHaveBeenCalledTimes(1);

    rerender(
      <TooltipProvider>
        <Messages chat={{ ...base, historyLimit: 40 }} onLoadOlder={onLoadOlder} />
      </TooltipProvider>,
    );
    await waitFor(() => expect(document.querySelectorAll("[data-row-key]").length).toBe(40));
    expect(document.querySelector("[data-row-key]")?.getAttribute("data-row-key")).toBe("a10");
  });

  test("a retryable provider failure shows a retry card", () => {
    render(
      () => <TooltipProvider>
        <Messages
          chat={{
            ...chat([{ key: "u1", role: "user", text: "first" }]),
            retry: { attempt: 2, next: new Date(Date.now() + 5000).toISOString(), message: "rate limited" },
          }}
        />
      </TooltipProvider>,
    );
    expect(screen.getByText(/attempt 2/)).toBeTruthy();
    expect(screen.getByText(/retrying in/)).toBeTruthy();
    expect(screen.getByText("rate limited")).toBeTruthy();
  });

  test("a failed run shows the error card inside the timeline", () => {
    render(
      () => <TooltipProvider>
        <Messages
          chat={{
            ...chat([{ key: "u1", role: "user", text: "first" }]),
            error: "Provider: stream failed",
          }}
        />
      </TooltipProvider>,
    );
    expect(screen.getByText("Provider:")).toBeTruthy();
    expect(screen.getByText("stream failed")).toBeTruthy();
  });

  test("long user messages fold with a read-more toggle", async () => {    const text = Array.from({ length: 14 }, (_, index) => `line ${index + 1}`).join("\n");
    render(
      () => <TooltipProvider>
        <Messages chat={chat([{ key: "u1", role: "user", text }])} />
      </TooltipProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Read more" }));
    expect(screen.getByRole("button", { name: "Show less" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Show less" }));
    expect(screen.getByRole("button", { name: "Read more" })).toBeTruthy();
  });

  test("a subagent tool renders the task card and opens its child session", async () => {
    const onOpenSession = vi.fn();
    render(
      () => <TooltipProvider>
        <Messages
          onOpenSession={onOpenSession}
          chat={chat([
            {
              key: "t1",
              role: "tool",
              tool: {
                id: "t1",
                name: "subagent",
                arguments: JSON.stringify({
                  agent: "general",
                  description: "inspect tests",
                  background: true,
                }),
                output: "The subagent is working in the background (sessionID: sub_42).",
                done: false,
              },
            },
          ])}
        />
      </TooltipProvider>,
    );
    expect(screen.getByText("General")).toBeTruthy();
    expect(screen.getByText(/inspect tests/)).toBeTruthy();
    expect(screen.queryByText(/\(background\)/)).toBeNull();
    expect(document.querySelector('[data-entry="subagent"]')).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Open General session" }));
    expect(onOpenSession).toHaveBeenCalledWith("sub_42");
  });

  test("a shell entry shows its command and output", () => {
    render(
      () => <TooltipProvider>
        <Messages
          detail="everything"
          chat={chat([
            {
              key: "s1",
              role: "shell",
              shell: { command: "echo hi", output: "hi\n", exit: 0 },
            },
          ])}
        />
      </TooltipProvider>,
    );
    expect(screen.getAllByText("echo hi").length).toBeGreaterThan(0);
    expect(screen.getByText("hi")).toBeTruthy();
  });

  test("reasoning shows its duration once finished", () => {
    render(
      () => <TooltipProvider>
        <Messages
          chat={chat([
            {
              key: "r1",
              role: "reasoning",
              text: "## Plan\n\nbody",
              created: "2026-01-01T00:00:00Z",
              endedAt: "2026-01-01T00:01:05Z",
            },
          ])}
          detail="everything"
        />
      </TooltipProvider>,
    );
    expect(screen.getByText("Thought")).toBeTruthy();
    expect(screen.getByText("1m 5s")).toBeTruthy();
  });

  test("live reasoning shows its latest heading", () => {
    render(
      () => <TooltipProvider>
        <Messages
          chat={chat([
            {
              key: "r1",
              role: "reasoning",
              text: "## Designing experience\n\nbody",
              live: true,
            },
          ])}
          detail="everything"
        />
      </TooltipProvider>,
    );
    expect(screen.getByText("Thinking")).toBeTruthy();
    expect(screen.getByText("Designing experience")).toBeTruthy();
  });

  test("finished reasoning stops reading as Thinking while the turn still runs", () => {
    const running = chat([
      {
        key: "r1",
        role: "reasoning",
        text: "## Plan\n\nbody",
        created: "2026-01-01T00:00:00Z",
        endedAt: "2026-01-01T00:00:05Z",
        live: false,
      },
    ]);
    running.running = true;

    render(
      () => <TooltipProvider>
        <Messages chat={running} detail="compact" />
      </TooltipProvider>,
    );

    expect(screen.queryByText("Thinking")).toBeNull();
    expect(screen.getByText("Thought")).toBeTruthy();
  });

  test("reasoning body renders markdown", () => {
    render(
      () => <TooltipProvider>
        <Messages
          detail="everything"
          chat={chat([
            {
              key: "r1",
              role: "reasoning",
              text: "## Plan\n\n**Note** this line",
            },
          ])}
        />
      </TooltipProvider>,
    );
    const body = document.querySelector(".reasoning-markdown");
    expect(body).toBeTruthy();
    expect(body?.querySelector("strong")?.textContent).toBe("Note");
  });

  test("a failed shell entry names the exit code", () => {
    render(
      () => <TooltipProvider>
        <Messages
          detail="everything"
          chat={chat([
            {
              key: "s1",
              role: "shell",
              shell: { command: "false", output: "", exit: 2 },
            },
          ])}
        />
      </TooltipProvider>,
    );
    expect(screen.getByText("Command exited with code 2")).toBeTruthy();
  });

  test("timeline renders reasoning rows with Thought/Thinking labels", async () => {
    render(
      () => <Messages
        chat={chat([
          {
            key: "r1",
            role: "reasoning",
            text: "First thought\nsecond",
            live: false,
            created: "2026-01-01T00:00:00Z",
            endedAt: "2026-01-01T00:00:03Z",
          },
        ])}
        detail="everything"
      />,
    );
    await waitFor(() => expect(screen.getByText("Thought")).toBeTruthy());
    expect(screen.getByText("3s")).toBeTruthy();
  });
});
