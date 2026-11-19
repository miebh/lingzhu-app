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

describe("tool progress", () => {
  test("a running tool replaces its metadata before the result", () => {
    let chats: Record<string, ChatState> = { s1: chat([]) };
    chats = applyEvent(chats, "s1", event("tool.call", { id: "c1", name: "execute", arguments: "{}" }));
    chats = applyEvent(chats, "s1", event("tool.progress", {
      id: "c1",
      metadata: { toolCalls: [{ tool: "Bun.Glob", status: "running", input: { pattern: "*" } }] },
    }));

    const running = chats.s1.entries.find((entry) => entry.role === "tool");
    expect(running?.tool?.metadata?.toolCalls).toEqual([
      { tool: "Bun.Glob", status: "running", input: { pattern: "*" } },
    ]);

    chats = applyEvent(chats, "s1", event("tool.result", {
      id: "c1",
      output: "ok",
      metadata: { toolCalls: [{ tool: "Bun.Glob", status: "completed", input: { pattern: "*" } }] },
    }));
    expect(running).toBeDefined();
    expect(chats.s1.entries.find((entry) => entry.role === "tool")?.tool?.done).toBe(true);
  });
});
