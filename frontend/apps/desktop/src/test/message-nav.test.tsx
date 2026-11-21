import { render, waitFor } from "./solid-testing";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { Messages } from "@lingzhu/session-ui/Messages";
import { messageNavItems } from "@lingzhu/session-ui/MessageNav";
import { timelineRows } from "@lingzhu/session-ui/timeline";
import { TooltipProvider } from "@lingzhu/ui/tooltip";
import { timelineDetail } from "@lingzhu/session-ui/timeline-detail";
import type { ChatState, TimelineEntry } from "@lingzhu/ui/types";

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

const diff = (file: string, added: number) =>
  ["--- a/" + file, "+++ b/" + file, "@@ -1 +1 @@", ...Array(added).fill("+x"), "-y", ""].join("\n");

const prompt = (key: string, text: string): TimelineEntry => ({ key, role: "user", text });

describe("message navigator", () => {
  test("each prompt owns the diffs of its own turn", () => {
    const rows = timelineRows(
      [
        prompt("u1", "first ask"),
        { key: "t1", role: "tool", tool: { id: "e1", name: "edit", arguments: "{}", done: true, diff: diff("a.ts", 3) } },
        prompt("u2", "second ask\nmore detail"),
        { key: "t2", role: "tool", tool: { id: "e2", name: "edit", arguments: "{}", done: true, diff: diff("b.ts", 7) } },
      ],
      timelineDetail("compact"),
      { running: false, showTurnDiffs: false },
    );

    const items = messageNavItems(rows);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ key: "u1", label: "first ask", added: 3, removed: 1 });
    expect(items[1]).toMatchObject({ key: "u2", label: "second ask", added: 7, removed: 1 });
  });

  test("one tick per prompt renders and jumps to that prompt", async () => {
    const { container } = render(
      () => <TooltipProvider>
        <Messages
          chat={chat([
            prompt("u1", "first ask"),
            { key: "a1", role: "assistant", text: "one" },
            prompt("u2", "second ask"),
            { key: "a2", role: "assistant", text: "two" },
          ])}
        />
      </TooltipProvider>,
    );

    const nav = container.querySelector('[data-component="message-nav"]');
    expect(nav).toBeTruthy();
    const ticks = container.querySelectorAll('[data-slot="message-nav-tick-button"]');
    expect(ticks).toHaveLength(2);
    expect(ticks[1].getAttribute("aria-label")).toBe("Jump to second ask");

    // Spy on the prompt row itself so the assertion proves which row was targeted.
    const target = container.querySelector('[data-message-id="u1"]') as HTMLElement;
    const scrolled = vi.fn();
    target.scrollIntoView = scrolled;

    await userEvent.click(ticks[0] as HTMLElement);
    await waitFor(() => expect(scrolled).toHaveBeenCalledWith({ block: "start" }));
    // Jumping detaches following, so the reader can scroll freely afterwards.
    expect(container.querySelector('[aria-label="Scroll to latest"]')).toBeTruthy();
  });

  test("the hover card lists every prompt with its change bars", async () => {
    const { container } = render(
      () => <TooltipProvider>
        <Messages
          chat={chat([
            prompt("u1", "first ask"),
            { key: "a1", role: "assistant", text: "one" },
            prompt("u2", "second ask"),
            { key: "a2", role: "assistant", text: "two" },
          ])}
        />
      </TooltipProvider>,
    );

    const nav = container.querySelector('[data-component="message-nav"]') as HTMLElement;
    await userEvent.hover(nav);

    const card = await waitFor(() => {
      const found = container.querySelector('[data-slot="message-nav-hovercard-content"]');
      expect(found).toBeTruthy();
      return found as HTMLElement;
    });
    expect(card.textContent).toContain("first ask");
    expect(card.textContent).toContain("second ask");
    expect(card.querySelectorAll('[data-slot="message-nav-diff-bars"]')).toHaveLength(2);
  });

  test("a single prompt renders no navigator", () => {
    const { container } = render(
      () => <TooltipProvider>
        <Messages chat={chat([prompt("u1", "only ask"), { key: "a1", role: "assistant", text: "answer" }])} />
      </TooltipProvider>,
    );
    expect(container.querySelector('[data-component="message-nav"]')).toBeNull();
  });

  test("the active tick tracks the newest prompt", () => {
    const { container } = render(
      () => <TooltipProvider>
        <Messages
          chat={chat([
            prompt("u1", "first ask"),
            { key: "a1", role: "assistant", text: "one" },
            prompt("u2", "second ask"),
            { key: "a2", role: "assistant", text: "two" },
          ])}
        />
      </TooltipProvider>,
    );
    const ticks = container.querySelectorAll('[data-slot="message-nav-tick-button"]');
    expect(ticks[0].getAttribute("data-active")).toBeNull();
    expect(ticks[1].getAttribute("data-active")).toBe("true");
  });
});
