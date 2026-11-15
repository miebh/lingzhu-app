import { render, waitFor } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { Messages } from "@lingzhu/session-ui/Messages";
import { TooltipProvider } from "@lingzhu/ui/tooltip";
import { applyEvent } from "@/lib/chat-events";
import type { ChatState, CoreEvent, TimelineEntry } from "@lingzhu/ui/types";

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

describe("agent and model switches", () => {
  test("a live agent switch appends a transcript row and updates the chat", () => {
    const next = applyEvent({ s1: chat([]) }, "s1", event("session.agent.selected", { agent: "plan", previous: "build" }));
    expect(next.s1.agent).toBe("plan");
    expect(next.s1.entries).toHaveLength(1);
    expect(next.s1.entries[0].role).toBe("switch");
    expect(next.s1.entries[0].switch).toMatchObject({ kind: "agent", agent: "plan", previous: "build" });
  });

  test("a live model switch records both selections", () => {
    const next = applyEvent(
      { s1: chat([]) },
      "s1",
      event("session.model.selected", {
        provider: "anthropic",
        model: "claude",
        previous: { provider: "openai", model: "gpt" },
      }),
    );
    expect(next.s1.provider).toBe("anthropic");
    expect(next.s1.model).toBe("claude");
    expect(next.s1.entries[0].switch).toMatchObject({
      kind: "model",
      provider: "anthropic",
      model: "claude",
      previousProvider: "openai",
      previousModel: "gpt",
    });
  });

  test("a switch draws the divider with the agent's name", async () => {
    const { container } = render(
      <TooltipProvider>
        <Messages
          chat={chat([
            { key: "u1", role: "user", text: "hi" },
            { key: "s1", role: "switch", switch: { kind: "agent", agent: "plan", previous: "build" } },
          ])}
        />
      </TooltipProvider>,
    );

    await waitFor(() => expect(container.textContent).toContain("Switched to Plan"));
    expect(container.querySelector(".timeline-separator-line")).toBeTruthy();
  });

  test("a model switch names the model, falling back to its id", async () => {
    const { container } = render(
      <TooltipProvider>
        <Messages
          chat={chat([
            { key: "u1", role: "user", text: "hi" },
            { key: "s1", role: "switch", switch: { kind: "model", provider: "openai", model: "gpt-5" } },
          ])}
        />
      </TooltipProvider>,
    );

    await waitFor(() => expect(container.textContent).toContain("Switched to gpt-5"));
  });
});

describe("live status line", () => {
  test("a running shell says it waits on the command", async () => {
    const { container } = render(
      <TooltipProvider>
        <Messages
          chat={chat(
            [
              { key: "u1", role: "user", text: "hi" },
              { key: "t1", role: "tool", tool: { id: "t1", name: "shell", arguments: "{}", done: false } },
            ],
            true,
          )}
        />
      </TooltipProvider>,
    );

    await waitFor(() => expect(container.querySelector('[data-status="waitingShell"]')).toBeTruthy());
  });

  test("a pending permission outranks the running call", async () => {
    const pending = chat([{ key: "u1", role: "user", text: "hi" }], true);
    pending.pending = [{ id: "p1", sessionId: "s1", action: "shell", resources: [] }];
    const { container } = render(
      <TooltipProvider>
        <Messages chat={pending} />
      </TooltipProvider>,
    );

    await waitFor(() => expect(container.querySelector('[data-status="waitingApproval"]')).toBeTruthy());
  });

  test("a live thought keeps the status line showing", async () => {
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
    // The thought row is still on screen; the status line just no longer gives
    // its place away, so Working stays readable for the whole turn.
    expect(working.getAttribute("data-collapsed")).toBeNull();
    expect(working.className).not.toContain("h-0");
    expect(working.getAttribute("data-status")).toBe("working");
  });
});
