import { describe, expect, test } from "vitest";
import { isSessionNotFound } from "@/lib/errors";
import { applyEvent } from "@/lib/chat-events";
import type { ChatState, CoreEvent } from "@lingzhu/ui/types";

function event(type: string, data: Record<string, unknown> = {}): CoreEvent {
  return { type, workspace: ".", sessionId: "s1", seq: 1, at: new Date().toISOString(), data } as unknown as CoreEvent;
}

describe("deleted sessions", () => {
  test("a missing session is recognised from the core error", () => {
    expect(isSessionNotFound("core 404: session not found")).toBe(true);
    expect(isSessionNotFound(new Error("core 404: session not found"))).toBe(true);
    expect(isSessionNotFound("Session not found: s1")).toBe(true);
    // Ordinary failures keep surfacing as errors.
    expect(isSessionNotFound("core 500: boom")).toBe(false);
    expect(isSessionNotFound("context canceled")).toBe(false);
  });

  test("a session.deleted event is not folded into the transcript", () => {
    const chat = {
      id: "s1",
      title: "S",
      draft: false,
      entries: [],
      running: false,
      tokens: 0,
      pending: [],
      questions: [],
    } as unknown as ChatState;
    const next = applyEvent({ s1: chat }, "s1", event("session.deleted", { sessionID: "s1" }));
    // The store removes the chat itself; folding the event must add no row.
    expect(next.s1.entries).toHaveLength(0);
  });
});
