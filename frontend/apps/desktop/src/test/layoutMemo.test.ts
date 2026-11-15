import { describe, expect, test } from "vitest";
import { layoutPropsEqual } from "@/lib/layoutMemo";
import type { ChatState } from "@lingzhu/ui/types";

const chat = (overrides: Partial<ChatState> = {}): ChatState =>
  ({
    id: "s1",
    title: "Session one",
    entries: [],
    running: false,
    pending: [],
    questions: [],
    draft: false,
    ...overrides,
  }) as ChatState;

describe("layoutPropsEqual", () => {
  test("ignores handler identity but honors data", () => {
    const left = { title: "a", chats: { k: chat() }, onOpen: () => undefined };
    const right = { title: "a", chats: { k: chat() }, onOpen: () => undefined };
    expect(layoutPropsEqual(left, right)).toBe(true);
    expect(layoutPropsEqual(left, { ...right, title: "b" })).toBe(false);
  });

  test("streaming entries do not invalidate the layout", () => {
    const before = chat();
    const after = chat({ entries: [{ key: "e", role: "assistant", text: "streamed" }] as ChatState["entries"] });
    expect(layoutPropsEqual({ chats: { k: before } }, { chats: { k: after } })).toBe(true);
  });

  test("a running or failed status invalidates the layout", () => {
    expect(layoutPropsEqual({ chats: { k: chat() } }, { chats: { k: chat({ running: true }) } })).toBe(false);
    expect(
      layoutPropsEqual({ chats: { k: chat() } }, { chats: { k: chat({ lastRunStatus: "failed" }) } }),
    ).toBe(false);
  });

  test("tab arrays compare by value", () => {
    const tabs = [{ key: "a", label: "A" }];
    expect(layoutPropsEqual({ tabs }, { tabs: [{ key: "a", label: "A" }] })).toBe(true);
    expect(layoutPropsEqual({ tabs }, { tabs: [{ key: "a", label: "B" }] })).toBe(false);
  });
});
