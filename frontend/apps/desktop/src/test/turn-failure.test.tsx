import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { Messages } from "@lingzhu/session-ui/Messages";
import { TooltipProvider } from "@lingzhu/ui/tooltip";
import { entriesFromMessages, type ChatState, type Message, type TimelineEntry } from "@lingzhu/ui/types";

function chat(entries: TimelineEntry[]): ChatState {
  return {
    id: "s1",
    title: "S",
    entries,
    running: false,
    tokens: 0,
    pending: [],
    questions: [],
    loading: false,
    draft: false,
  } as unknown as ChatState;
}

function history(entries: TimelineEntry[]) {
  return (
    <TooltipProvider>
      <Messages chat={chat(entries)} detail="compact" />
    </TooltipProvider>
  );
}

describe("recorded turn failures", () => {
  test("a failure row from history renders its message", () => {
    const entries = entriesFromMessages([
      { role: "user", content: "do the work" },
      { role: "assistant", content: "", failure: { message: "provider exploded" } },
    ] as Message[]);
    expect(entries.some((entry) => entry.role === "failure")).toBe(true);
    render(history(entries));
    expect(screen.getByText(/provider exploded/)).toBeTruthy();
  });

  test("a failure row is not replayed as assistant text", () => {
    const entries = entriesFromMessages([
      { role: "user", content: "do the work" },
      { role: "assistant", content: "", failure: { message: "provider exploded" } },
    ] as Message[]);
    // The failure entry carries no text of its own, so the transcript never
    // shows an empty assistant bubble beside the error card.
    const failure = entries.find((entry) => entry.role === "failure");
    expect(failure?.text).toBeUndefined();
  });

  test("a turn without a failure row draws no error card", () => {
    const entries = entriesFromMessages([
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
    ] as Message[]);
    expect(entries.some((entry) => entry.role === "failure")).toBe(false);
  });
});
