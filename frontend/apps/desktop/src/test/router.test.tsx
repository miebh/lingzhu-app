import { cleanup, screen, waitFor } from "./solid-testing";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderApp } from "./render-app";
import { decodeSegment, encodeSegment, sessionHref } from "@/lib/routes";
import { defaultPreferences } from "@/lib/preferences";
import { useChatStore } from "@/store/chat";
import { usePreferencesStore } from "@/store/preferences";
import { useViewStore } from "@/store/view";
import { useWorkspaceStore } from "@/store/workspaces";
import { chatKey } from "@lingzhu/ui/domain/chat";
import { setLanguage } from "@lingzhu/ui/i18n";
import type { ChatState } from "@lingzhu/ui/types";

vi.mock("@/lib/api", () => {
  const mocks: Record<string, unknown> = {
    newSessionID: vi.fn(async () => "draft-1"),
    sessions: vi.fn(async () => []),
    location: vi.fn(async () => undefined),
  };
  return {
    api: new Proxy(mocks, {
      get: (target, property) =>
        typeof property === "string" && property in target ? target[property] : vi.fn(async () => []),
    }),
  };
});

const durable = chatKey("/w", "s1");

const chat = (id: string, title: string): ChatState =>
  ({
    id,
    title,
    workspace: "/w",
    entries: [],
    running: false,
    tokens: 0,
    pending: [],
    questions: [],
    loading: false,
    draft: false,
  }) as unknown as ChatState;

describe("route table", () => {
  beforeEach(() => {
    cleanup();
    setLanguage("en");
    localStorage.clear();
    useWorkspaceStore.setState({
      workspaces: [{ path: "/w", name: "lingzhu", addr: "127.0.0.1:1", connected: true, error: "" }],
      activePath: "/w",
      loadingSessions: {},
      sessionsByWorkspace: { "/w": [{ id: "s1", title: "Only session", updated: "1" }] },
    });
    useChatStore.setState({
      chats: { [durable]: chat("s1", "Only session") },
      activeByWorkspace: { "/w": "s1" },
    });
    useViewStore.setState({ tab: "chat", homeOpen: true, settingsOpen: false });
    usePreferencesStore.setState({ preferences: defaultPreferences });
  });

  test("workspace segments survive encoding", () => {
    const path = "C:\\项目\\lingzhu path";
    expect(decodeSegment(encodeSegment(path))).toBe(path);
  });

  test("a session URL selects its workspace and session", async () => {
    useChatStore.setState({ activeByWorkspace: {} });

    renderApp(sessionHref("/w", "s1"));

    await waitFor(() => expect(useChatStore.getState().activeByWorkspace["/w"]).toBe("s1"));
    expect(useWorkspaceStore.getState().activePath).toBe("/w");
    expect(useViewStore.getState().homeOpen).toBe(false);
    // Opening a durable session remembers it for the next launch.
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem("lingzhu.sessionTabsRecent") ?? "null")?.key).toBe(durable),
    );
    expect(screen.getByRole("button", { name: /Home/ }).getAttribute("aria-pressed")).toBe("false");
  });

  test("settings navigation writes the section and comes back to the previous route", async () => {
    renderApp(sessionHref("/w", "s1"));
    await waitFor(() => expect(window.location.pathname).toContain("/workspace/"));

    useViewStore.getState().openSettings("models");
    await waitFor(() => expect(window.location.pathname).toBe("/settings/models"));
    expect(useViewStore.getState().settingsSection).toBe("models");
    expect(useViewStore.getState().settingsOpen).toBe(true);

    useViewStore.getState().closeSettings();
    await waitFor(() => expect(window.location.pathname).toContain("/workspace/"));
    expect(useViewStore.getState().settingsOpen).toBe(false);
  });

  test("a new chat opens the draft route", async () => {
    renderApp("/");
    await waitFor(() => expect(useViewStore.getState().homeOpen).toBe(true));

    await useChatStore.getState().newChat("/w");

    await waitFor(() => expect(window.location.pathname).toBe("/new-session"));
    expect(new URLSearchParams(window.location.search).get("draftId")).toBe("draft-1");
    expect(useViewStore.getState().homeOpen).toBe(false);
  });
});
