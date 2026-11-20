import { describe, expect, test } from "vitest";
import { removeTabsForSessions } from "@/lib/sessionTabs";
import { chatKey } from "@lingzhu/ui/domain/chat";

const tab = (path: string, id: string) => ({ key: chatKey(path, id), path, sessionID: id });

describe("removeTabsForSessions", () => {
  test("removing the only active tab leaves no target", () => {
    const only = tab("/w", "s1");
    expect(removeTabsForSessions([only], [{ path: "/w", id: "s1" }], only.key)).toEqual({
      next: [],
      target: undefined,
      removedActive: true,
    });
  });

  test("removing the active tab selects the tab that took its place", () => {
    const first = tab("/w", "s1");
    const second = tab("/w", "s2");
    const third = tab("/w", "s3");
    const result = removeTabsForSessions([first, second, third], [{ path: "/w", id: "s2" }], second.key);
    expect(result.next).toEqual([first, third]);
    expect(result.target).toBe(third);
  });

  test("removing an inactive tab keeps the current selection", () => {
    const first = tab("/w", "s1");
    const second = tab("/w", "s2");
    const result = removeTabsForSessions([first, second], [{ path: "/w", id: "s2" }], first.key);
    expect(result.removedActive).toBe(false);
    expect(result.target).toBeUndefined();
    expect(result.next).toEqual([first]);
  });
});
