import { beforeEach, describe, expect, test } from "vitest";
import { isCancellation, messageOf } from "@lingzhu/app/lib/errors";
import { applyEvent } from "@lingzhu/app/lib/chat-events";
import type { ChatState, CoreEvent } from "@lingzhu/ui/types";
import { notify, useNotifyStore } from "@lingzhu/app/store/notify";

describe("cancellation errors", () => {
  beforeEach(() => {
    useNotifyStore.getState().dismiss();
  });

  test("recognises the cancel forms produced by the bindings and the core", () => {
    for (const value of [
      "context canceled",
      "context cancelled",
      "wait cancelled",
      "cancelled",
      "Cancelled by user",
      "interrupted",
    ]) {
      expect(isCancellation(value)).toBe(true);
      expect(messageOf(value)).toBe("");
    }
  });

  test("keeps real failures readable", () => {
    expect(isCancellation("permission denied")).toBe(false);
    expect(messageOf("permission denied")).toBe("permission denied");
  });

  test("does not raise a toast for a cancelled operation", () => {
    notify("cancelled job");
    expect(useNotifyStore.getState().notice).toBeUndefined();
    notify("permission denied");
    expect(useNotifyStore.getState().notice?.text).toBe("permission denied");
  });

  test("does not put a cancellation into the chat error state", () => {
    const chat = { entries: [], running: true } as unknown as ChatState;
    const event = { type: "error", data: { message: "context canceled" } } as unknown as CoreEvent;
    const next = applyEvent({ w: chat }, "w", event).w;
    expect(next.error).toBeUndefined();
    expect(next.lastRunStatus).toBe("stopped");
  });
});
