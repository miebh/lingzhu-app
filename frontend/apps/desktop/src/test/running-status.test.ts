import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  api: {
    messages: vi.fn(async () => []),
    usage: vi.fn(async () => ({
      sessionId: "s1",
      calls: 0,
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    })),
    pending: vi.fn(async () => []),
    questions: vi.fn(async () => []),
  },
}));

import { applyEvent } from "@lingzhu/app/lib/chat-events";
import { useChatStore } from "@/store/chat";
import { blankChat, chatKey, type ChatState, type CoreEvent } from "@lingzhu/ui/types";

const key = chatKey("/w", "s1");

function idle(): ChatState {
  return { ...blankChat("s1", "S"), draft: false };
}

function event(type: string, data: Record<string, unknown> = {}): CoreEvent {
  return { type, workspace: "/w", sessionId: "s1", seq: 1, at: new Date().toISOString(), data } as unknown as CoreEvent;
}

describe("live turn status", () => {
  beforeEach(() => {
    useChatStore.setState({ chats: { [key]: idle() }, activeByWorkspace: { "/w": "s1" } });
  });

  test("a reopened session restores its persisted counters and selection", async () => {
    const api = (await import("@/lib/api")).api;
    vi.mocked(api.usage).mockResolvedValueOnce({
      sessionId: "s1",
      calls: 2,
      input: 900,
      output: 300,
      cacheRead: 100,
      cacheWrite: 50,
      total: 1350,
      last: { input: 400, output: 120, cacheRead: 40, cacheWrite: 10 },
    } as never);
    vi.mocked(api.messages).mockResolvedValueOnce([
      { role: "user", content: "hi", provider: "openai", model: "gpt", agent: "build" },
    ] as never);

    await useChatStore.getState().refresh("/w", "s1");
    const chat = useChatStore.getState().chats[key];

    // The ring reads the last call's prompt size, the pane reads the totals.
    expect(chat.tokens).toBe(440);
    expect(chat.usage).toEqual({ input: 900, output: 300, cacheRead: 100, cacheWrite: 50 });
    // The newest user turn carries the selection, so the model can be priced.
    expect(chat.provider).toBe("openai");
    expect(chat.model).toBe("gpt");
    expect(chat.agent).toBe("build");
  });

  test("a prompt echo starts the turn even when this client did not send it", () => {
    const chats = applyEvent({ [key]: idle() }, key, event("user.message", { text: "hi" }));
    expect(chats[key].running).toBe(true);
    expect(chats[key].runStartedAt).toBeTypeOf("number");
  });

  test("the turn stays running while text streams and stops at the end", () => {
    let chats = applyEvent({ [key]: idle() }, key, event("user.message", { text: "hi" }));
    chats = applyEvent(chats, key, event("text.delta", { text: "hel" }));
    expect(chats[key].running).toBe(true);
    chats = applyEvent(chats, key, event("text.delta", { text: "lo" }));
    expect(chats[key].running).toBe(true);
    chats = applyEvent(chats, key, event("run.end", { reason: "done" }));
    expect(chats[key].running).toBe(false);
  });

  test("a snapshot fetched right after the end does not revive the status row", async () => {
    useChatStore.getState().handleEvent(event("run.end", { reason: "done" }));
    expect(useChatStore.getState().chats[key].running).toBe(false);

    // The core still reports the turn as running until its goroutine unwinds.
    await useChatStore.getState().refresh("/w", "s1");
    expect(useChatStore.getState().chats[key].running).toBe(false);
  });

});
