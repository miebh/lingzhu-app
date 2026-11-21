import { cleanup, waitFor } from "./solid-testing";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderApp } from "./render-app";
import { armStartupRestore } from "@/lib/startupRestore";
import { chatKey } from "@lingzhu/ui/domain/chat";
import { defaultPreferences } from "@/lib/preferences";
import { useChatStore } from "@/store/chat";
import { usePreferencesStore } from "@/store/preferences";
import { useTabsStore } from "@/store/tabs";
import { useViewStore } from "@/store/view";
import { useWorkspaceStore } from "@/store/workspaces";
import { setLanguage } from "@lingzhu/ui/i18n";

vi.mock("@/lib/api", () => {
  const mocks: Record<string, unknown> = {
    location: vi.fn(async () => undefined),
    sessions: vi.fn(async () => []),
  };
  return {
    api: new Proxy(mocks, {
      get: (target, property) =>
        typeof property === "string" && property in target ? target[property] : vi.fn(async () => []),
    }),
  };
});

const tab = (id: string) => ({ key: chatKey("/w", id), path: "/w", sessionID: id });

describe("startup restore", () => {
  beforeEach(() => {
    cleanup();
    setLanguage("en");
    localStorage.clear();
    useTabsStore.setState({ tabs: [], closed: [], recent: undefined, seen: {} });
    useWorkspaceStore.setState({
      workspaces: [{ path: "/w", name: "lingzhu", addr: "127.0.0.1:1", connected: true, error: "" }],
      ready: true,
      activePath: "/w",
      loadingSessions: {},
      sessionsByWorkspace: { "/w": [{ id: "s1", title: "Only session", updated: "2" }] },
    });
    useChatStore.setState({ chats: {}, activeByWorkspace: {} });
    useViewStore.setState({ tab: "chat", homeOpen: true, settingsOpen: false });
    usePreferencesStore.setState({ preferences: defaultPreferences });
  });

  test("opens the remembered tab instead of Home", async () => {
    localStorage.setItem("lingzhu.sessionTabs", JSON.stringify([tab("s1")]));
    localStorage.setItem("lingzhu.sessionTabsRecent", JSON.stringify(tab("s1")));
    useTabsStore.setState({ tabs: [tab("s1")], recent: tab("s1") });
    armStartupRestore();

    renderApp("/");

    await waitFor(() => expect(window.location.pathname).toContain("/workspace/"));
    expect(window.location.pathname).toContain("/session/s1");
    await waitFor(() => expect(useChatStore.getState().activeByWorkspace["/w"]).toBe("s1"));
  });

  test("falls back to the last tab when no recent tab was saved", async () => {
    localStorage.setItem("lingzhu.sessionTabs", JSON.stringify([tab("s1"), tab("s2")]));
    useTabsStore.setState({ tabs: [tab("s1"), tab("s2")], recent: undefined });
    armStartupRestore();

    renderApp("/");

    await waitFor(() => expect(window.location.pathname).toContain("/session/s2"));
  });

  test("drops a stale recent tab and restores the remaining one", async () => {
    const stale = { key: chatKey("/w", "gone"), path: "/w", sessionID: "gone" };
    localStorage.setItem("lingzhu.sessionTabs", JSON.stringify([tab("s1")]));
    localStorage.setItem("lingzhu.sessionTabsRecent", JSON.stringify(stale));
    useTabsStore.setState({ tabs: [tab("s1")], recent: stale });
    armStartupRestore();

    renderApp("/");

    await waitFor(() => expect(window.location.pathname).toContain("/session/s1"));
    // The restored tab becomes the new recent tab before the stale one is gone.
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem("lingzhu.sessionTabsRecent") ?? "null")?.key).toBe(chatKey("/w", "s1")),
    );
  });

  test("stays on Home when no tabs were saved", async () => {
    armStartupRestore();

    renderApp("/");

    await waitFor(() => expect(window.location.pathname).toBe("/"));
  });
});
