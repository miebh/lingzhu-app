import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/api", () => {
  const mocks: Record<string, unknown> = {
    remove: vi.fn(),
    interrupt: vi.fn(),
    newSessionID: vi.fn(),
  };
  return {
    api: new Proxy(mocks, {
      get: (target, property) =>
        typeof property === "string" && property in target ? target[property] : vi.fn(async () => []),
    }),
  };
});

import { AppShell } from "@/app/AppShell";
import { api } from "@/lib/api";
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
    tokens: 0,    pending: [],
    questions: [],
    loading: false,
    draft: false,
  }) as unknown as ChatState;

async function deleteTab(label: RegExp) {
  const user = userEvent.setup();
  fireEvent.contextMenu(screen.getByRole("tab", { name: label }));
  await user.click(await screen.findByRole("menuitem", { name: "Delete session…" }));
}

describe("the full session delete sequence", () => {
  beforeEach(() => {
    cleanup();
    setLanguage("en");
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1400 });
    vi.mocked(api.remove).mockReset().mockResolvedValue(undefined);
    vi.mocked(api.interrupt).mockReset().mockResolvedValue(false);
    vi.mocked(api.newSessionID).mockReset().mockResolvedValue("draft-1");
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
    useViewStore.setState({ tab: "chat", homeOpen: true, settingsOpen: false });
    usePreferencesStore.setState({
      preferences: {
        ...defaultPreferences,
        appearance: { ...defaultPreferences.appearance, sidebarOrganize: "list" },
      },
    });
  });

  test("new session always opens another draft", async () => {
    localStorage.setItem("lingzhu.sessionTabs", "[]");
    useWorkspaceStore.setState({ sessionsByWorkspace: { "/w": [] } });
    useChatStore.setState({ chats: {}, activeByWorkspace: {} });
    useViewStore.setState({ tab: "chat", homeOpen: true, settingsOpen: false });
    vi.mocked(api.newSessionID)
      .mockReset()
      .mockResolvedValueOnce("draft-a")
      .mockResolvedValueOnce("draft-b");

    const user = userEvent.setup();
    render(<AppShell />);
    const rail = screen.getByRole("complementary", { name: "Side tabs" });

    const newSession = () => within(rail).getByRole("button", { name: /New session/, expanded: false });
    await user.click(newSession());
    await screen.findByRole("tab", { name: /New session/ });
    await user.click(newSession());

    await waitFor(() => expect(screen.getAllByRole("tab", { name: /New session/ })).toHaveLength(2));
    // Drafts live only in memory: restarting must not turn them into empty chats.
    expect(JSON.parse(localStorage.getItem("lingzhu.sessionTabs") ?? "[]")).toEqual([]);
    expect(Object.keys(useChatStore.getState().chats).sort()).toEqual([chatKey("/w", "draft-a"), chatKey("/w", "draft-b")].sort());
    expect(useChatStore.getState().activeByWorkspace["/w"]).toBe("draft-b");
  });

  test("closing the only draft tab returns Home", async () => {
    const draftKey = chatKey("/w", "draft-1");
    localStorage.setItem("lingzhu.sessionTabs", JSON.stringify([{ key: draftKey, path: "/w", sessionID: "draft-1" }]));
    useWorkspaceStore.setState({ sessionsByWorkspace: { "/w": [] } });
    useChatStore.setState({
      chats: { [draftKey]: { ...chat("draft-1", "New session"), draft: true } },
      activeByWorkspace: { "/w": "draft-1" },
    });
    useViewStore.setState({ tab: "chat", homeOpen: false, settingsOpen: false });

    const user = userEvent.setup();
    render(<AppShell />);
    const homeState = () => screen.getByRole("button", { name: /Home/ }).getAttribute("aria-pressed");
    expect(homeState()).toBe("false");

    const draftTab = screen.getByRole("tab", { name: /New session/ });
    await user.click(within(draftTab.closest(".side-tab") as HTMLElement).getByRole("button", { name: /Close/ }));

    expect(screen.queryByRole("tablist", { name: "Open tabs" })).toBeNull();
    expect(homeState()).toBe("true");
    expect(api.remove).not.toHaveBeenCalled();
  });

  test("deleting a restored tab with no loaded session returns Home", async () => {
    useWorkspaceStore.setState({ sessionsByWorkspace: { "/w": [] } });
    useChatStore.setState({ chats: {}, activeByWorkspace: {} });
    useViewStore.setState({ tab: "chat", homeOpen: false, settingsOpen: false });

    render(<AppShell />);
    const homeState = () => screen.getByRole("button", { name: /Home/ }).getAttribute("aria-pressed");
    expect(homeState()).toBe("false");

    await deleteTab(/New session/);

    expect(screen.queryByRole("tablist", { name: "Open tabs" })).toBeNull();
    expect(homeState()).toBe("true");
    // No durable row exists, so this is a local tab removal, not a core call.
    expect(api.remove).not.toHaveBeenCalled();
  });

  test("delete the only session, create one, delete it again", async () => {
    const user = userEvent.setup();
    render(<AppShell />);
    const homeState = () =>
      screen.getByRole("button", { name: /Home/ }).getAttribute("aria-pressed");
    expect(homeState()).toBe("true");

    await deleteTab(/Only session/);
    await user.click(await screen.findByRole("button", { name: "Delete" }, { timeout: 5000 }));
    expect(screen.queryByRole("tablist", { name: "Open tabs" })).toBeNull();
    expect(homeState()).toBe("true");

    const rail = screen.getByRole("complementary", { name: "Side tabs" });
    await user.click(within(rail).getByRole("button", { name: /New session/ }));
    const draftTab = await screen.findByRole("tab", { name: /New session/ });
    expect(draftTab).toBeTruthy();
    expect(homeState()).toBe("false");

    await deleteTab(/New session/);
    // A draft delete is immediate: no core call and no confirmation dialog.
    expect(screen.queryByRole("tablist", { name: "Open tabs" })).toBeNull();
    expect(homeState()).toBe("true");
    expect(api.remove).toHaveBeenCalledTimes(1);
    expect(api.remove).toHaveBeenCalledWith("/w", "s1");
  });

  test("restored tabs for sessions deleted elsewhere are dropped after the list loads", async () => {
    localStorage.setItem(
      "lingzhu.sessionTabs",
      JSON.stringify([
        { key: durable, path: "/w", sessionID: "s1" },
        { key: chatKey("/w", "gone"), path: "/w", sessionID: "gone" },
      ]),
    );
    useWorkspaceStore.setState({
      loadingSessions: { "/w": false },
      sessionsByWorkspace: { "/w": [{ id: "s1", title: "Only session", updated: "1" }] },
    });
    useChatStore.setState({ chats: {}, activeByWorkspace: {} });
    useViewStore.setState({ tab: "chat", homeOpen: true, settingsOpen: false });

    render(<AppShell />);

    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem("lingzhu.sessionTabs") ?? "[]")).toEqual([
        { key: durable, path: "/w", sessionID: "s1" },
      ]),
    );
  });
});
