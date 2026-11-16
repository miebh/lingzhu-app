import { describe, expect, test } from "vitest";
import { applyEvent } from "@/lib/chat-events";
import type { ChatState, CoreEvent, TimelineEntry } from "@lingzhu/ui/types";

function chat(entries: TimelineEntry[]): ChatState {
  return {
    id: "s1",
    title: "S",
    entries,
    running: true,
    tokens: 0,
    pending: [],
    questions: [],
    loading: false,
    draft: false,
  } as unknown as ChatState;
}

function event(type: string, data: Record<string, unknown> = {}): CoreEvent {
  return { type, workspace: ".", sessionId: "s1", seq: 1, at: new Date().toISOString(), data } as unknown as CoreEvent;
}

describe("assistant text reconciliation", () => {
  test("a step that streams text then calls tools keeps one assistant row", () => {
    let chats: Record<string, ChatState> = { s1: chat([]) };
    chats = applyEvent(chats, "s1", event("text.delta", { text: "Found the lock: " }));
    chats = applyEvent(chats, "s1", event("text.delta", { text: "Explorer holds it." }));
    chats = applyEvent(chats, "s1", event("tool.call", { id: "c1", name: "shell", arguments: "{}" }));
    chats = applyEvent(chats, "s1", event("tool.result", { id: "c1", output: "ok" }));
    chats = applyEvent(chats, "s1", event("assistant.message", { text: "Found the lock: Explorer holds it." }));

    const assistant = chats.s1.entries.filter((entry) => entry.role === "assistant");
    expect(assistant).toHaveLength(1);
    expect(assistant[0].text).toBe("Found the lock: Explorer holds it.");
    expect(assistant[0].live).toBe(false);
    // The finalized text stays above the tool call it introduced.
    expect(chats.s1.entries.map((entry) => entry.role)).toEqual(["assistant", "tool"]);
  });

  test("a step without streamed text still appends its reply", () => {
    let chats: Record<string, ChatState> = { s1: chat([]) };
    chats = applyEvent(chats, "s1", event("tool.call", { id: "c1", name: "shell", arguments: "{}" }));
    chats = applyEvent(chats, "s1", event("tool.result", { id: "c1", output: "ok" }));
    chats = applyEvent(chats, "s1", event("assistant.message", { text: "Only the final text." }));

    expect(chats.s1.entries.map((entry) => entry.role)).toEqual(["tool", "assistant"]);
    expect(chats.s1.entries[1].text).toBe("Only the final text.");
  });

  test("a second step's reply does not overwrite the first step's", () => {
    let chats: Record<string, ChatState> = { s1: chat([]) };
    chats = applyEvent(chats, "s1", event("text.delta", { text: "First." }));
    chats = applyEvent(chats, "s1", event("tool.call", { id: "c1", name: "shell", arguments: "{}" }));
    chats = applyEvent(chats, "s1", event("tool.result", { id: "c1", output: "ok" }));
    chats = applyEvent(chats, "s1", event("assistant.message", { text: "First." }));
    chats = applyEvent(chats, "s1", event("text.delta", { text: "Second." }));
    chats = applyEvent(chats, "s1", event("assistant.message", { text: "Second." }));

    expect(chats.s1.entries.filter((entry) => entry.role === "assistant").map((entry) => entry.text)).toEqual([
      "First.",
      "Second.",
    ]);
  });

  test("text that resumes after a tool call joins the same row", () => {
    let chats: Record<string, ChatState> = { s1: chat([]) };
    chats = applyEvent(chats, "s1", event("text.delta", { text: "Before. " }));
    chats = applyEvent(chats, "s1", event("tool.call", { id: "c1", name: "shell", arguments: "{}" }));
    chats = applyEvent(chats, "s1", event("tool.result", { id: "c1", output: "ok" }));
    chats = applyEvent(chats, "s1", event("text.delta", { text: "After." }));
    chats = applyEvent(chats, "s1", event("assistant.message", { text: "Before. After." }));

    expect(chats.s1.entries.map((entry) => entry.role)).toEqual(["assistant", "tool"]);
    expect(chats.s1.entries[0].text).toBe("Before. After.");
    expect(chats.s1.entries[0].live).toBe(false);
  });

  test("reasoning that resumes after a tool call opens a new thought", () => {
    let chats: Record<string, ChatState> = { s1: chat([]) };
    chats = applyEvent(chats, "s1", event("reasoning.delta", { text: "First thought. " }));
    chats = applyEvent(chats, "s1", event("tool.call", { id: "c1", name: "shell", arguments: "{}" }));
    chats = applyEvent(chats, "s1", event("tool.result", { id: "c1", output: "ok" }));
    chats = applyEvent(chats, "s1", event("reasoning.delta", { text: "Second thought." }));

    const reasoning = chats.s1.entries.filter((entry) => entry.role === "reasoning");
    expect(reasoning).toHaveLength(2);
    expect(reasoning[0].text).toBe("First thought. ");
    expect(reasoning[0].live).toBe(false);
    expect(reasoning[1].text).toBe("Second thought.");
    expect(reasoning[1].live).toBe(true);
  });

  test("a turn that ends mid-stream closes its rows before the next turn", () => {
    let chats: Record<string, ChatState> = { s1: chat([]) };
    chats = applyEvent(chats, "s1", event("user.message", { text: "first" }));
    chats = applyEvent(chats, "s1", event("text.delta", { text: "half a reply" }));
    chats = applyEvent(chats, "s1", event("run.end", { reason: "interrupted" }));
    chats = applyEvent(chats, "s1", event("user.message", { text: "second" }));
    chats = applyEvent(chats, "s1", event("text.delta", { text: "a fresh reply" }));

    const assistant = chats.s1.entries.filter((entry) => entry.role === "assistant");
    expect(assistant.map((entry) => entry.text)).toEqual(["half a reply", "a fresh reply"]);
    expect(assistant[0].live).toBe(false);
    expect(assistant[1].live).toBe(true);
  });

  test("a new turn's reply never merges into an earlier turn's thought", () => {
    let chats: Record<string, ChatState> = { s1: chat([]) };
    chats = applyEvent(chats, "s1", event("user.message", { text: "first" }));
    chats = applyEvent(chats, "s1", event("reasoning.delta", { text: "Plan the first." }));
    chats = applyEvent(chats, "s1", event("user.message", { text: "second" }));
    chats = applyEvent(
      chats,
      "s1",
      event("assistant.message", { text: "", reasoning: "Plan the first. And more." }),
    );

    const reasoning = chats.s1.entries.filter((entry) => entry.role === "reasoning");
    expect(reasoning).toHaveLength(2);
    expect(reasoning[0].text).toBe("Plan the first.");
    expect(reasoning[1].text).toBe("Plan the first. And more.");
  });
});
