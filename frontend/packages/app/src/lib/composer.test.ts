import { describe, expect, test } from "vitest";
import {
  composerActiveIndex,
  composerSubmitMode,
  matchesComposerCommand,
  moveComposerSelection,
  slashQuery,
} from "./composer";

const ready = {
  running: false,
  empty: false,
  sending: false,
  attaching: false,
  attachmentsBlocked: false,
  disabled: false,
};

describe("composer submission state", () => {
  test("an empty composer inside a run stops instead of sending", () => {
    expect(composerSubmitMode({ ...ready, running: true, empty: true })).toBe("stop");
  });

  test("anything in flight blocks the submit control", () => {
    for (const patch of [
      { disabled: true },
      { empty: true },
      { sending: true },
      { attaching: true },
      { attachmentsBlocked: true },
    ]) {
      expect(composerSubmitMode({ ...ready, ...patch })).toBe("blocked");
    }
  });

  test("a ready draft sends", () => {
    expect(composerSubmitMode(ready)).toBe("send");
  });
});

describe("composer command matching", () => {
  test("an empty query matches every command", () => {
    expect(matchesComposerCommand({ name: "review" }, "")).toBe(true);
  });

  test("case-insensitive name, description and plugin matches", () => {
    const command = { name: "Review", description: "Inspect changes", plugin: "Git" };
    expect(matchesComposerCommand(command, "rev")).toBe(true);
    expect(matchesComposerCommand(command, "inspect")).toBe(true);
    expect(matchesComposerCommand(command, "git")).toBe(true);
    expect(matchesComposerCommand(command, "deploy")).toBe(false);
  });

  test("only an unterminated slash opens the command query", () => {
    expect(slashQuery("/rev")).toBe("rev");
    expect(slashQuery("/review now")).toBeNull();
    expect(slashQuery("rev")).toBeNull();
  });
});

describe("composer selection", () => {
  test("the active index clamps to the filtered length", () => {
    expect(composerActiveIndex(5, 2)).toBe(1);
    expect(composerActiveIndex(0, 0)).toBe(0);
  });

  test("arrow movement wraps in both directions", () => {
    expect(moveComposerSelection(0, 1, 3)).toBe(1);
    expect(moveComposerSelection(0, -1, 3)).toBe(2);
    expect(moveComposerSelection(0, 1, 0)).toBe(0);
  });
});
