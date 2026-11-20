import { describe, expect, test } from "vitest";
import type { SessionDiff } from "@lingzhu/ui/types";
import {
  createSessionDiffState,
  sessionDiffView,
  transitionSessionDiff,
  type SessionDiffState,
} from "./review-machine";

const diff = (files: string[]): SessionDiff =>
  ({ diffs: files.map((file) => ({ file, patch: "", additions: 0, deletions: 0 })) }) as SessionDiff;

function loading(attempt: number): SessionDiffState {
  return transitionSessionDiff(createSessionDiffState(), { type: "load", attempt });
}

describe("session diff machine", () => {
  test("a successful load selects the first file", () => {
    const state = transitionSessionDiff(loading(1), { type: "loaded", attempt: 1, diff: diff(["a.ts", "b.ts"]) });
    expect(sessionDiffView(state)).toEqual({
      diff: diff(["a.ts", "b.ts"]),
      selected: "a.ts",
      loading: false,
      error: "",
    });
  });

  test("a stale response from an earlier session is ignored", () => {
    const current = loading(2);
    expect(transitionSessionDiff(current, { type: "loaded", attempt: 1, diff: diff(["old.ts"]) })).toBe(current);
    expect(transitionSessionDiff(current, { type: "failed", attempt: 1, message: "old" })).toBe(current);
  });

  test("selecting a file is ignored before the diff arrives", () => {
    const current = loading(1);
    expect(transitionSessionDiff(current, { type: "selected", file: "a.ts" })).toBe(current);
  });

  test("selection survives while the same diff stays ready", () => {
    const ready = transitionSessionDiff(loading(1), {
      type: "loaded",
      attempt: 1,
      diff: diff(["a.ts", "b.ts"]),
    });
    expect(sessionDiffView(transitionSessionDiff(ready, { type: "selected", file: "b.ts" })).selected).toBe("b.ts");
  });

  test("a failure reports the error and drops the diff", () => {
    const next = transitionSessionDiff(loading(1), { type: "failed", attempt: 1, message: "boom" });
    expect(sessionDiffView(next)).toMatchObject({ diff: undefined, selected: undefined, error: "boom" });
  });
});
