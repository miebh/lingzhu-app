import { renderHook } from "./solid-testing";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useAppNotifications } from "@lingzhu/app/app/useAppNotifications";
import { useChatStore } from "@lingzhu/app/store/chat";
import { usePreferencesStore } from "@lingzhu/app/store/preferences";
import { useNotifyStore } from "@lingzhu/app/store/notify";
import { defaultPreferences } from "@lingzhu/app/lib/preferences";
import { chatKey } from "@lingzhu/ui/domain/chat";
import { type ChatState } from "@lingzhu/ui/types";

const { notifyTask, setWatchedSession, setNoticeCopy } = await vi.hoisted(async () => ({
  notifyTask: vi.fn(async (_notice: unknown) => undefined),
  setWatchedSession: vi.fn(async (_workspace: string, _sessionID: string) => undefined),
  setNoticeCopy: vi.fn(async (_copy: unknown) => undefined),
}));
vi.mock("@lingzhu/app/lib/api", () => ({ api: { notifyTask, setWatchedSession, setNoticeCopy } }));

function chat(overrides: Partial<ChatState>): ChatState {
  return {
    id: "s1",
    title: "Fix the build",
    draft: false,
    entries: [],
    running: false,
    tokens: 0,
    pending: [],
    questions: [],
    ...overrides,
  } as ChatState;
}

function focus(value: boolean) {
  Object.defineProperty(document, "hasFocus", { configurable: true, value: () => value });
}

describe("notices for the session the user is not watching", () => {
  beforeEach(() => {
    notifyTask.mockClear();
    setWatchedSession.mockClear();
    setNoticeCopy.mockClear();
    useNotifyStore.getState().dismiss();
    usePreferencesStore.setState({ preferences: defaultPreferences });
    focus(true);
  });

  afterEach(() => {
    focus(true);
  });

  test("publishes the conversation on screen for the Go watcher", () => {
    useChatStore.setState({ chats: {}, activeByWorkspace: {} });
    renderHook(() => useAppNotifications(() => "/w", () => "s1"));

    expect(setWatchedSession).toHaveBeenCalledWith("/w", "s1");
  });

  test("hands the Go notifier the current wording", () => {
    useChatStore.setState({ chats: {}, activeByWorkspace: {} });
    renderHook(() => useAppNotifications(() => "/w", () => "s1"));

    // The toast is raised from the event stream, so it cannot read the message
    // catalog; the copy has to travel with the subscription.
    expect(setNoticeCopy).toHaveBeenCalled();
    const copy = setNoticeCopy.mock.calls[0][0] as unknown as {
      finished: string;
      failed: string;
      clickToOpen: string;
    };
    expect(copy.finished).not.toBe("");
    expect(copy.failed).not.toBe("");
    expect(copy.clickToOpen).not.toBe("");
  });

  test("clears the watched session when none is open", () => {
    useChatStore.setState({ chats: {}, activeByWorkspace: {} });
    renderHook(() => useAppNotifications(() => undefined, () => undefined));

    expect(setWatchedSession).toHaveBeenCalledWith("", "");
  });

  test("a permission request in a background window raises a toast", () => {
    focus(false);
    useChatStore.setState({
      chats: { [chatKey("/w", "s1")]: chat({ running: true }) },
      activeByWorkspace: { "/w": "s1" },
    });
    renderHook(() => useAppNotifications(() => "/w", () => "s1"));
    useChatStore.setState({
      chats: {
        [chatKey("/w", "s1")]: chat({ running: true, pending: [{ id: "p1" }] as ChatState["pending"] }),
      },
    });
    
    expect(notifyTask).toHaveBeenCalledTimes(1);
    const notice = notifyTask.mock.calls[0][0] as unknown as {
      workspace: string;
      sessionID: string;
      title: string;
    };
    expect(notice.workspace).toBe("/w");
    expect(notice.sessionID).toBe("s1");
    expect(notice.title).toContain("Fix the build");
  });

  test("a question in a background window raises a toast", () => {
    focus(false);
    useChatStore.setState({
      chats: { [chatKey("/w", "s1")]: chat({ running: true }) },
      activeByWorkspace: { "/w": "s1" },
    });
    renderHook(() => useAppNotifications(() => "/w", () => "s1"));
    useChatStore.setState({
      chats: {
        [chatKey("/w", "s1")]: chat({ running: true, questions: [{ id: "q1" }] as ChatState["questions"] }),
      },
    });
    
    expect(notifyTask).toHaveBeenCalledTimes(1);
  });

  test("a foreground window uses the in-app card for another session", () => {
    useChatStore.setState({
      chats: { [chatKey("/w", "s1")]: chat({ running: true }) },
      activeByWorkspace: { "/w": "s2" },
    });
    renderHook(() => useAppNotifications(() => "/w", () => "s2"));
    useChatStore.setState({
      chats: {
        [chatKey("/w", "s1")]: chat({ running: true, pending: [{ id: "p1" }] as ChatState["pending"] }),
      },
    });
    
    expect(notifyTask).not.toHaveBeenCalled();
    const notice = useNotifyStore.getState().notice;
    expect(notice?.title).toContain("Fix the build");
    expect(notice?.target).toEqual({ workspace: "/w", sessionID: "s1" });
  });

  test("the session on screen stays quiet", () => {
    useChatStore.setState({
      chats: { [chatKey("/w", "s1")]: chat({ running: true }) },
      activeByWorkspace: { "/w": "s1" },
    });
    renderHook(() => useAppNotifications(() => "/w", () => "s1"));
    useChatStore.setState({
      chats: {
        [chatKey("/w", "s1")]: chat({ running: true, pending: [{ id: "p1" }] as ChatState["pending"] }),
      },
    });
    
    expect(notifyTask).not.toHaveBeenCalled();
    expect(useNotifyStore.getState().notice).toBeUndefined();
  });

  test("a blocked system channel still reaches the user", async () => {
    focus(false);
    notifyTask.mockRejectedValueOnce(new Error("notifications are unavailable"));
    useChatStore.setState({
      chats: { [chatKey("/w", "s1")]: chat({ running: true }) },
      activeByWorkspace: { "/w": "s1" },
    });
    renderHook(() => useAppNotifications(() => "/w", () => "s1"));
    useChatStore.setState({
      chats: {
        [chatKey("/w", "s1")]: chat({ running: true, pending: [{ id: "p1" }] as ChatState["pending"] }),
      },
    });
    
    await Promise.resolve();
    await Promise.resolve();
    expect(useNotifyStore.getState().notice?.title).toContain("Fix the build");
  });

  test("a finished run is left to the Go watcher", () => {
    focus(false);
    useChatStore.setState({
      chats: { [chatKey("/w", "s1")]: chat({ running: true }) },
      activeByWorkspace: { "/w": "s1" },
    });
    renderHook(() => useAppNotifications(() => "/w", () => "s1"));
    useChatStore.setState({ chats: { [chatKey("/w", "s1")]: chat({ running: false }) } });
    
    // The page may be suspended while minimised, so it must not be the only
    // thing that reports a finished run.
    expect(notifyTask).not.toHaveBeenCalled();
    expect(useNotifyStore.getState().notice).toBeUndefined();
  });

  test("the approval channel can be turned off", () => {
    focus(false);
    usePreferencesStore.setState({
      preferences: {
        ...defaultPreferences,
        notifications: { ...defaultPreferences.notifications, permissions: false },
      },
    });
    useChatStore.setState({
      chats: { [chatKey("/w", "s1")]: chat({ running: true }) },
      activeByWorkspace: { "/w": "s1" },
    });
    renderHook(() => useAppNotifications(() => "/w", () => "s1"));
    useChatStore.setState({
      chats: {
        [chatKey("/w", "s1")]: chat({ running: true, pending: [{ id: "p1" }] as ChatState["pending"] }),
      },
    });
    
    expect(notifyTask).not.toHaveBeenCalled();
    expect(useNotifyStore.getState().notice).toBeUndefined();
  });
});
