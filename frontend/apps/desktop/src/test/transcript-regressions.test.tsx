import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { Messages } from "@lingzhu/session-ui/Messages";
import { TooltipProvider } from "@lingzhu/ui/tooltip";
import { applyEvent } from "@/lib/chat-events";
import { entriesFromMessages, type ChatState, type CoreEvent, type Message, type TimelineEntry } from "@lingzhu/ui/types";

function chat(entries: TimelineEntry[], running = false): ChatState {
  return {
    id: "s1",
    title: "S",
    entries,
    running,
    tokens: 0,    pending: [],
    questions: [],
    loading: false,
    draft: false,
  } as unknown as ChatState;
}

function event(type: string, data: Record<string, unknown> = {}): CoreEvent {
  return { type, workspace: ".", sessionId: "s1", seq: 1, at: new Date().toISOString(), data } as unknown as CoreEvent;
}

function edit(key: string, id: string, path: string, added: string): TimelineEntry {
  return {
    key,
    role: "tool",
    tool: {
      id,
      name: "edit",
      arguments: JSON.stringify({ path }),
      done: true,
      diff: `--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n-old\n+${added}\n`,
    },
  };
}

describe("transcript regressions", () => {
  test("the first prompt of a session draws no switch divider", () => {
    const fresh = applyEvent(
      { s1: chat([]) },
      "s1",
      event("session.model.selected", { provider: "openai", model: "gpt-5" }),
    );
    expect(fresh.s1.entries).toHaveLength(0);

    const agent = applyEvent({ s1: chat([]) }, "s1", event("session.agent.selected", { agent: "build" }));
    expect(agent.s1.entries).toHaveLength(0);
  });

  test("a real switch still draws its divider", () => {
    const next = applyEvent(
      { s1: chat([]) },
      "s1",
      event("session.model.selected", {
        provider: "anthropic",
        model: "claude",
        previous: { provider: "openai", model: "gpt" },
      }),
    );
    expect(next.s1.entries).toHaveLength(1);
    expect(next.s1.entries[0].role).toBe("switch");
  });

  test("history keeps a real switch and drops a first-selection row", () => {
    const stored = [
      { role: "user", content: "one", switch: { kind: "model", provider: "openai", model: "gpt-5" } },
      { role: "user", content: "two", switch: { kind: "model", provider: "anthropic", model: "claude", previousProvider: "openai", previousModel: "gpt-5" } },
    ] as unknown as Message[];
    const entries = entriesFromMessages(stored);
    expect(entries.filter((entry) => entry.role === "switch")).toHaveLength(1);
    expect(entries[0].switch).toMatchObject({ kind: "model", model: "claude" });
  });

  test("two changes to the same file open independently", async () => {
    render(
      <TooltipProvider>
        <Messages
          detail={{
            shell: { placement: "separate", details: "collapsed" },
            edit: { placement: "separate", details: "collapsed" },
            thinking: { placement: "separate", details: "collapsed" },
            subagents: { placement: "separate" },
            notices: { placement: "separate" },
            tools: { placement: "separate" },
            commentary: { placement: "separate" },
          }}
          chat={chat([edit("t1", "1", "src/a.ts", "one"), edit("t2", "2", "src/a.ts", "two")])}
        />
      </TooltipProvider>,
    );

    const triggers = await waitFor(() => {
      const found = document.querySelectorAll<HTMLButtonElement>('[data-slot="accordion-trigger"]');
      expect(found.length).toBe(2);
      return found;
    });
    expect(document.querySelectorAll('[data-slot="accordion-content"]')).toHaveLength(0);

    await userEvent.click(triggers[0]);
    expect(document.querySelectorAll('[data-slot="accordion-content"]')).toHaveLength(1);
    expect(triggers[1].getAttribute("aria-expanded")).toBe("false");
  });

  test("a sent prompt keeps its meta line hidden until hover", () => {
    render(
      <TooltipProvider>
        <Messages chat={chat([{ key: "u1", role: "user", text: "hi", agent: "build", model: "gpt-5" }])} showAgent />
      </TooltipProvider>,
    );
    const label = document.querySelector('[data-slot="user-message-meta-label"]');
    expect(label?.className).toContain("opacity-0");
    expect(label?.className).toContain("group-hover/user:opacity-100");
  });

  test("a live thought leaves the status line showing Working", async () => {
    // The thought keeps its own row, and the status line stays visible instead
    // of collapsing to make room for it.
    const { container } = render(
      <TooltipProvider>
        <Messages
          chat={chat(
            [
              { key: "u1", role: "user", text: "hi" },
              { key: "r1", role: "reasoning", text: "thinking", live: true },
            ],
            true,
          )}
        />
      </TooltipProvider>,
    );
    const working = await waitFor(() => {
      const found = container.querySelector<HTMLElement>('[data-component="session-working"]');
      expect(found).toBeTruthy();
      return found!;
    });
    expect(working.getAttribute("data-collapsed")).toBeNull();
    expect(working.className).not.toContain("h-0");
    expect(screen.getByText("Thinking")).toBeTruthy();
  });

  test("a file list nested in a summary block reserves no sticky title row", async () => {
    // Inside a summary block there is no tool title above the file headers, so
    // reserving its height would park every header in empty space and make it
    // float mid-content while the transcript scrolls.
    const { container } = render(
      <TooltipProvider>
        <Messages detail="compact" chat={chat([edit("t1", "1", "src/a.ts", "one")])} />
      </TooltipProvider>,
    );
    await userEvent.click(await screen.findByRole("button", { name: /Used 1 Edit/ }));
    const root = await waitFor(() => {
      const found = container.querySelector<HTMLElement>('[data-component="edit-tool"]');
      expect(found).toBeTruthy();
      return found!;
    });
    expect(root.hasAttribute("data-header")).toBe(false);
  });

  test("a file list with its own tool title reserves the sticky title row", async () => {
    const { container } = render(
      <TooltipProvider>
        <Messages detail="everything" chat={chat([edit("t1", "1", "src/a.ts", "one")])} />
      </TooltipProvider>,
    );
    const root = await waitFor(() => {
      const found = container.querySelector<HTMLElement>('[data-component="edit-tool"]');
      expect(found).toBeTruthy();
      return found!;
    });
    expect(root.hasAttribute("data-header")).toBe(true);
  });
});
