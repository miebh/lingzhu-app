import { describe, expect, test } from "vitest";
import { timelineStatus } from "@lingzhu/session-ui/status";
import {
  COMPACTION_GRACE_MS,
  COMPACTION_RECENT_DONE_MS,
  GRACE_ELAPSED_EVENT,
  createCompactionEntranceState,
  selectCompactionEnter,
  transitionCompactionEntrance,
} from "@lingzhu/session-ui/compaction-entrance";
import type { TimelineEntry } from "@lingzhu/ui/types";

function tool(id: string, name: string, done: boolean): TimelineEntry {
  return { key: id, role: "tool", tool: { id, name, arguments: "{}", done } };
}

describe("timelineStatus", () => {
  test("a permission outranks everything else", () => {
    expect(timelineStatus({ blocked: "approval", entries: [tool("1", "shell", false)] })).toBe("waitingApproval");
  });

  test("a question reads as waiting for an answer", () => {
    expect(timelineStatus({ blocked: "answer", entries: [] })).toBe("waitingAnswer");
  });

  test("a running shell says it waits on the command", () => {
    expect(timelineStatus({ entries: [tool("1", "shell", false)] })).toBe("waitingShell");
  });

  test("any other running call is working", () => {
    expect(timelineStatus({ entries: [tool("1", "read", false)] })).toBe("working");
    expect(timelineStatus({ entries: [tool("1", "read", true)] })).toBe("working");
    expect(timelineStatus({ entries: [] })).toBe("working");
  });
});

describe("compaction entrance", () => {
  test("a new running compaction waits out the grace", () => {
    const start = createCompactionEntranceState({ ageMs: 0, running: true });
    expect(start.state.status).toBe("grace");
    expect(start.effects).toEqual([{ type: "schedule-grace", delayMs: COMPACTION_GRACE_MS }]);
    expect(selectCompactionEnter(start.state)).toBe("grace");

    const revealed = transitionCompactionEntrance(start.state, GRACE_ELAPSED_EVENT);
    expect(revealed.state.status).toBe("revealed");
    // It keeps the grace styling so the light does not restart.
    expect(selectCompactionEnter(revealed.state)).toBe("grace");
  });

  test("one that finishes inside the grace enters as done only", () => {
    const start = createCompactionEntranceState({ ageMs: 0, running: true });
    const done = transitionCompactionEntrance(start.state, { type: "running.changed", running: false });
    expect(done.state.status).toBe("instant");
    expect(done.effects).toEqual([{ type: "cancel-grace" }]);
    expect(selectCompactionEnter(done.state)).toBe("now");
  });

  test("one that just finished on mount fades in as done", () => {
    const state = createCompactionEntranceState({ ageMs: COMPACTION_RECENT_DONE_MS / 2, running: false });
    expect(state.state.status).toBe("instant");
  });

  test("history that was already settled gets no entrance", () => {
    const running = createCompactionEntranceState({ ageMs: COMPACTION_GRACE_MS * 4, running: true });
    expect(running.state.status).toBe("settled");
    expect(selectCompactionEnter(running.state)).toBeUndefined();

    const done = createCompactionEntranceState({ ageMs: COMPACTION_RECENT_DONE_MS * 4, running: false });
    expect(done.state.status).toBe("settled");
  });
});
