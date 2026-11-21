import { render } from "./solid-testing";
import { describe, expect, test } from "vitest";
import { Messages } from "@lingzhu/session-ui/Messages";
import { TooltipProvider } from "@lingzhu/ui/tooltip";
import type { ChatState, TimelineEntry } from "@lingzhu/ui/types";

const tool = (id: string, name: string): TimelineEntry => ({
  key: `t-${id}`,
  role: "tool",
  tool: { id, name, arguments: "{}", done: true },
});

function chat(entries: TimelineEntry[]): ChatState {
  return {
    id: "s1",
    title: "S",
    entries,
    running: false,
    tokens: 0,    pending: [],
    questions: [],
    loading: false,
    draft: false,
  } as unknown as ChatState;
}

describe("a notice between tool blocks", () => {
  test("an instruction update reads as an informational notice, not a completion", () => {
    const entries: TimelineEntry[] = [
      {
        key: "n1",
        role: "notice",
        text: "Instructions updated",
        notice: {
          source: "instructions",
          state: "completed",
          description: "Instructions updated",
          sources: ["agents", "environment"],
        },
      },
    ];

    const { container } = render(
      () => <TooltipProvider>
        <Messages chat={chat(entries)} detail="everything" />
      </TooltipProvider>,
    );

    const row = container.querySelector<HTMLElement>('[data-slot="session-timeline-notice"]')!;
    expect(row.textContent).toContain("Instructions updated · AGENTS.md, Environment");
    expect(row.textContent).not.toContain("finished");
    expect(row.getAttribute("data-outcome")).toBeNull();
  });

  test("keeps the tight tool gap, so it does not read as a divider", () => {
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

    const { container } = render(
      () => <TooltipProvider>
        <Messages chat={chat(entries)} detail="compact" />
      </TooltipProvider>,
    );

    const wrappers = [...container.querySelectorAll("[data-row-key]")];
    expect(wrappers).toHaveLength(3);

    // A background report keeps its own notice row, spaced like the activity
    // around it, and the block after it keeps the tight tool gap rather than
    // reading as a divider.
    expect(wrappers[1].className).toBe("pt-2");
    expect(wrappers[2].className).toBe("pt-2");
  });
});
