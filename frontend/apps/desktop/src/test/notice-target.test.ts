import { beforeEach, describe, expect, test, vi } from "vitest";
import { openNoticeTarget } from "@lingzhu/app/lib/notice";
import { useChatStore } from "@lingzhu/app/store/chat";
import { useViewStore } from "@lingzhu/app/store/view";
import { useWorkspaceStore } from "@lingzhu/app/store/workspaces";

describe("a notice click returns to its session", () => {
  beforeEach(() => {
    useViewStore.setState({ tab: "chat", homeOpen: true, settingsOpen: false });
    useWorkspaceStore.setState({ activePath: undefined });
    useChatStore.setState({ chats: {}, activeByWorkspace: {} });
    vi.spyOn(useChatStore.getState(), "open").mockResolvedValue(undefined);
  });

  test("leaves home, selects the workspace and opens the conversation", () => {
    const open = vi.spyOn(useChatStore.getState(), "open").mockResolvedValue(undefined);
    openNoticeTarget({ workspace: "/w", sessionID: "s1" });

    expect(useViewStore.getState().homeOpen).toBe(false);
    expect(useViewStore.getState().tab).toBe("chat");
    expect(useWorkspaceStore.getState().activePath).toBe("/w");
    expect(open).toHaveBeenCalledWith("/w", "s1");
  });

  test("closes settings so the session is visible", () => {
    useViewStore.getState().openSettings();
    const open = vi.spyOn(useChatStore.getState(), "open").mockResolvedValue(undefined);
    openNoticeTarget({ workspace: "/w", sessionID: "s1" });

    expect(useViewStore.getState().settingsOpen).toBe(false);
    expect(useViewStore.getState().tab).toBe("chat");
    expect(open).toHaveBeenCalledWith("/w", "s1");
  });
});
