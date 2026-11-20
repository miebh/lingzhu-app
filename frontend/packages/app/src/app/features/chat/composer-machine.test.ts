import { describe, expect, test } from "vitest";
import { createComposerState, transitionComposer } from "./composer-machine";

describe("composer machine", () => {
  test("starts in prompt mode with the preferred delivery", () => {
    expect(createComposerState("queue")).toMatchObject({
      mode: "prompt",
      delivery: "queue",
      submitting: false,
      attachment: { busy: false, error: "" },
    });
  });

  test("shell mode and delivery are independent", () => {
    let state = createComposerState("steer");
    state = transitionComposer(state, { type: "mode.set", mode: "shell" });
    state = transitionComposer(state, { type: "delivery.set", delivery: "queue" });
    expect(state.mode).toBe("shell");
    expect(state.delivery).toBe("queue");
  });

  test("submit and attachment gates settle on their own events", () => {
    let state = createComposerState("steer");
    state = transitionComposer(state, { type: "submit.start" });
    expect(state.submitting).toBe(true);
    state = transitionComposer(state, { type: "submit.settle" });
    expect(state.submitting).toBe(false);

    state = transitionComposer(state, { type: "attachment.start" });
    expect(state.attachment).toEqual({ busy: true, error: "" });
    state = transitionComposer(state, { type: "attachment.error", message: "too large" });
    expect(state.attachment).toEqual({ busy: true, error: "too large" });
    state = transitionComposer(state, { type: "attachment.finish" });
    expect(state.attachment).toEqual({ busy: false, error: "too large" });
  });

  test("a new pick clears the previous attachment error", () => {
    let state = createComposerState("steer");
    state = transitionComposer(state, { type: "attachment.error", message: "nope" });
    state = transitionComposer(state, { type: "attachment.start" });
    expect(state.attachment).toEqual({ busy: true, error: "" });
  });
});
