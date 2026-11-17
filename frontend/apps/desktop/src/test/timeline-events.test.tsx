import { render, waitFor } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { Messages } from "@lingzhu/session-ui/Messages";
import { TooltipProvider } from "@lingzhu/ui/tooltip";
import type { ChatState, TimelineEntry } from "@lingzhu/ui/types";

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

function tool(id: string, name: string, args: string, extra: Partial<TimelineEntry["tool"]> = {}): TimelineEntry {
  return { key: id, role: "tool", tool: { id, name, arguments: args, done: true, ...extra } };
}

describe("search tools", () => {
  test("a glob row shows its pattern and match count, never the raw list", async () => {
    const { container } = render(
      <TooltipProvider>
        <Messages
          detail="everything"
          chat={chat([tool("g1", "glob", '{"pattern":"**/*.ts","path":"src"}', { output: "src/a.ts\nsrc/b.ts" })])}
        />
      </TooltipProvider>,
    );

    await waitFor(() => expect(container.textContent).toContain("pattern=**/*.ts"));
    expect(container.textContent).toContain("2 matches");
    // The reference timeline never shows the raw result of a search.
    expect(container.textContent).not.toContain("src/a.ts");
  });

  test("a grep row keeps its match count without its output", async () => {
    const { container } = render(
      <TooltipProvider>
        <Messages
          detail="everything"
          chat={chat([
            tool("g1", "grep", '{"pattern":"needle","include":"*.ts"}', {
              output: "Found 3 matches\nsrc/a.ts:1: needle",
            }),
          ])}
        />
      </TooltipProvider>,
    );

    await waitFor(() => expect(container.textContent).toContain("3 matches"));
    expect(container.textContent).toContain("include=*.ts");
    expect(container.textContent).not.toContain("needle\n");
  });
});

describe("background notices", () => {
  test("a finished shell report keeps its own notice row", async () => {
    const { container } = render(
      <TooltipProvider>
        <Messages
          detail="everything"
          chat={chat([
            {
              key: "n1",
              role: "notice",
              text: "npm test",
              notice: { source: "shell", state: "completed", description: "npm test" },
            },
          ])}
        />
      </TooltipProvider>,
    );

    const row = await waitFor(() => {
      const found = container.querySelector<HTMLElement>('[data-slot="session-timeline-notice"]');
      expect(found).toBeTruthy();
      return found!;
    });
    expect(row.textContent).toContain("Shell finished · npm test");
    expect(row.getAttribute("data-outcome")).toBe("completed");
  });

  test("a failed report marks its own row", async () => {
    const { container } = render(
      <TooltipProvider>
        <Messages
          detail="everything"
          chat={chat([
            {
              key: "n1",
              role: "notice",
              text: "inspect tests",
              notice: { source: "subagent", state: "error", description: "inspect tests" },
            },
          ])}
        />
      </TooltipProvider>,
    );

    const row = await waitFor(() => {
      const found = container.querySelector<HTMLElement>('[data-slot="session-timeline-notice"]');
      expect(found).toBeTruthy();
      return found!;
    });
    expect(row.textContent).toContain("Subagent failed · inspect tests");
    expect(row.getAttribute("data-outcome")).toBe("error");
  });

  test("a cancelled shell report reads as cancelled", async () => {
    const { container } = render(
      <TooltipProvider>
        <Messages
          detail="everything"
          chat={chat([
            {
              key: "n1",
              role: "notice",
              text: "npm run dev",
              notice: { source: "shell", state: "cancelled", description: "npm run dev" },
            },
          ])}
        />
      </TooltipProvider>,
    );

    const row = await waitFor(() => {
      const found = container.querySelector<HTMLElement>('[data-slot="session-timeline-notice"]');
      expect(found).toBeTruthy();
      return found!;
    });
    expect(row.textContent).toContain("Shell cancelled · npm run dev");
    expect(row.getAttribute("data-outcome")).toBe("cancelled");
  });
});

describe("nested rails", () => {
  test("a collapsed group rail is measured from its content ink", async () => {
    const { container } = render(
      <TooltipProvider>
        <Messages
          detail="compact"
          chat={chat([
            tool("1", "grep", '{"pattern":"x"}'),
            tool("2", "read", '{"path":"a.ts"}'),
          ])}
        />
      </TooltipProvider>,
    );

    const trigger = await waitFor(() => {
      const found = container.querySelector<HTMLElement>('[data-component="context-tool-group-trigger"]')?.closest<HTMLElement>('[data-slot="collapsible-trigger"]');
      expect(found).toBeTruthy();
      return found!;
    });
    trigger.click();

    const content = await waitFor(() => {
      const found = container.querySelector<HTMLElement>('[data-component="collapsed-tool-group"] [data-slot="collapsible-content"]');
      expect(found).toBeTruthy();
      return found!;
    });
    // The tracker owns the rail: hovering its strip highlights that rail, and
    // the CSS falls back to a fixed inset when no ink was measured (jsdom
    // reports zero-size boxes).
    content.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 0, clientY: 0 }));
    expect(content.hasAttribute("data-rail-hover")).toBe(true);
  });
});
