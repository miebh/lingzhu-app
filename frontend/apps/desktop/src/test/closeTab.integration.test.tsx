import { cleanup, screen, waitFor, within } from "./solid-testing";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/api", () => {
  const mocks: Record<string, unknown> = {
    remove: vi.fn(),
    interrupt: vi.fn(),
    newSessionID: vi.fn(),
    location: vi.fn(async () => undefined),
    goalState: vi.fn(async () => undefined),
  };
  return {
    api: new Proxy(mocks, {
      get: (target, property) =>
        typeof property === "string" && property in target ? target[property] : vi.fn(async () => []),
    }),
  };
});

import { renderApp } from "./render-app";
import { sessionHref } from "@/lib/routes";
import { setLanguage } from "@lingzhu/ui/i18n";
import { defaultPreferences } from "@/lib/preferences";
import { useChatStore } from "@/store/chat";
import { usePreferencesStore } from "@/store/preferences";
import { useViewStore } from "@/store/view";
import { useWorkspaceStore } from "@/store/workspaces";
import { chatKey } from "@lingzhu/ui/domain/chat";
import { type ChatState } from "@lingzhu/ui/types";

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

describe("closing the last session tab", () => {
  beforeEach(() => {
    cleanup();
    setLanguage("en");
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1400 });
    localStorage.clear();
    localStorage.setItem("lingzhu.sidebarOpen", "true");
    localStorage.setItem(
      "lingzhu.sessionTabs",
      JSON.stringify([{ key: durable, path: "/w", sessionID: "s1" }]),
    );
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
    useViewStore.setState({ tab: "chat", homeOpen: false, settingsOpen: false });
    usePreferencesStore.setState({
      preferences: {
        ...defaultPreferences,
        appearance: { ...defaultPreferences.appearance, sidebarOrganize: "list" },
      },
    });
  });

  test("a durable last tab closes on the first click and stays closed", async () => {
    const user = userEvent.setup();
    renderApp(sessionHref("/w", "s1"));
    const homeState = () => screen.getByRole("button", { name: /Home/ }).getAttribute("aria-pressed");
    expect(homeState()).toBe("false");

    const tab = screen.getByRole("tab", { name: /Only session/ });
    await user.click(within(tab.closest(".side-tab") as HTMLElement).getByRole("button", { name: /Close/ }));

    await waitFor(() => expect(screen.queryByRole("tablist", { name: "Open tabs" })).toBeNull());
    expect(homeState()).toBe("true");
    // The tab rail must stay empty instead of re-opening the still-active session.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole("tablist", { name: "Open tabs" })).toBeNull();
    expect(JSON.parse(localStorage.getItem("lingzhu.sessionTabs") ?? "[]")).toEqual([]);
    // With no tabs left there is nothing to reopen on the next launch.
    expect(localStorage.getItem("lingzhu.sessionTabsRecent")).toBeNull();
  });
});